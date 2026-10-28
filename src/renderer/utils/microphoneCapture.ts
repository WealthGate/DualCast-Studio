import { unprocessedAudioConstraints } from "../../shared/programAudio";

type MicrophoneCaptureOptions = {
  deviceId?: string | null;
  onStream: (stream: MediaStream | null) => void;
  devices?: Pick<MediaDevices, "getUserMedia" | "addEventListener" | "removeEventListener">;
};

// A disconnected interface may return later. Recover the selected input without
// replacing a healthy capture when an unrelated camera or output device changes.
export const createMicrophoneCapture = ({ deviceId, onStream, devices = navigator.mediaDevices }: MicrophoneCaptureOptions) => {
  let stopped = false;
  let opening = false;
  let stream: MediaStream | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const stopStream = (value: MediaStream | null) => value?.getTracks().forEach(track => track.stop());
  const detach = () => stream?.getAudioTracks().forEach(track => track.removeEventListener("ended", recover));
  const open = async () => {
    if (stopped || opening) return;
    opening = true;
    clearTimeout(retry);
    try {
      const next = await devices.getUserMedia({ audio: unprocessedAudioConstraints(deviceId), video: false });
      if (stopped) { stopStream(next); return; }
      detach();
      stopStream(stream);
      stream = next;
      stream.getAudioTracks().forEach(track => track.addEventListener("ended", recover, { once: true }));
      onStream(stream);
    } catch (error) {
      if (stopped) return;
      if (!stream?.getAudioTracks().some(track => track.readyState === "live")) onStream(null);
      // Permission denial needs an operator change; repeatedly requesting it
      // would interrupt a broadcast. Missing/busy devices can recover in place.
      if (!(error instanceof DOMException) || !["NotAllowedError", "SecurityError"].includes(error.name)) {
        retry = setTimeout(() => { void open(); }, 2000);
      }
    } finally {
      opening = false;
    }
  };
  function recover() {
    if (stopped || stream?.getAudioTracks().some(track => track.readyState === "live")) return;
    clearTimeout(retry);
    retry = setTimeout(() => { void open(); }, 200);
  }
  devices.addEventListener("devicechange", recover);
  void open();
  return {
    stop: () => {
      stopped = true;
      clearTimeout(retry);
      devices.removeEventListener("devicechange", recover);
      detach();
      stopStream(stream);
      stream = null;
    }
  };
};

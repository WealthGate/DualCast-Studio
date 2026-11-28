import { unprocessedAudioConstraints } from "../../shared/programAudio";

type MicrophoneCaptureOptions = {
  deviceId?: string | null;
  channelCount?: number;
  onStream: (stream: MediaStream | null, issue?: string) => void;
  devices?: Pick<MediaDevices, "getUserMedia" | "addEventListener" | "removeEventListener">;
};

// A disconnected interface may return later. Recover the selected input without
// replacing a healthy capture when an unrelated camera or output device changes.
export const createMicrophoneCapture = ({ deviceId, channelCount = 2, onStream, devices = navigator.mediaDevices }: MicrophoneCaptureOptions) => {
  let stopped = false;
  let opening = false;
  let stream: MediaStream | null = null;
  let retry: ReturnType<typeof setTimeout> | undefined;
  const stopStream = (value: MediaStream | null) => value?.getTracks().forEach(track => track.stop());
  const liveTrack = () => stream?.getAudioTracks().find(track => track.readyState === "live");
  const detach = () => stream?.getAudioTracks().forEach(track => track.removeEventListener("ended", recover));
  const open = async () => {
    if (stopped || opening) return;
    opening = true;
    clearTimeout(retry);
    const requestedChannels = channelCount;
    try {
      const next = await devices.getUserMedia({ audio: unprocessedAudioConstraints(deviceId, requestedChannels), video: false });
      if (stopped) { stopStream(next); return; }
      const current = liveTrack();
      if (current && (next.getAudioTracks()[0]?.getSettings().channelCount ?? 1) <= (current.getSettings().channelCount ?? 1)) {
        // Keep the live input if the driver cannot offer additional channels.
        stopStream(next);
        return;
      }
      detach();
      stopStream(stream);
      stream = next;
      stream.getAudioTracks().forEach(track => track.addEventListener("ended", recover, { once: true }));
      onStream(stream);
    } catch (error) {
      if (stopped) return;
      if (liveTrack()) return;
      const name = error instanceof DOMException ? error.name : "";
      const denied = name === "NotAllowedError" || name === "SecurityError";
      const issue = denied ? "Allow microphone access in system privacy settings, then reselect the input or turn input lines off and on."
        : name === "NotFoundError" || name === "OverconstrainedError" ? "Reconnect this input or select another device in Input settings."
        : "The device could not be opened. Check its connection and close other apps using it.";
      onStream(null, issue);
      // Permission denial needs an operator change; repeatedly requesting it
      // would interrupt a broadcast. Missing/busy devices can recover in place.
      if (!denied) {
        retry = setTimeout(() => { void open(); }, 2000);
      }
    } finally {
      opening = false;
      if (!stopped && channelCount > requestedChannels && (liveTrack()?.getSettings().channelCount ?? 0) < channelCount) void open();
    }
  };
  function recover() {
    if (stopped || liveTrack()) return;
    clearTimeout(retry);
    retry = setTimeout(() => { void open(); }, 200);
  }
  devices.addEventListener("devicechange", recover);
  void open();
  return {
    requestChannels: (count: number) => {
      if (count <= channelCount) return;
      channelCount = count;
      if ((liveTrack()?.getSettings().channelCount ?? 0) < count) void open();
    },
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

type CaptureInput = { deviceId: string | null; channel: number | null };
const deviceKey = (deviceId: string | null) => deviceId || "default";

export const createAudioInputCapturePool = (onChange: () => void, devices?: MicrophoneCaptureOptions["devices"], onIssues?: (issues: Record<string, string>) => void) => {
  const issues = new Map<string, string>();
  const setIssue = (key: string, issue?: string) => {
    if (issues.get(key) === issue) return;
    if (issue) issues.set(key, issue);
    else issues.delete(key);
    onIssues?.(Object.fromEntries(issues));
  };
  const captures = new Map<string, { capture: ReturnType<typeof createMicrophoneCapture>; stream: MediaStream | null }>();
  const remove = (key: string) => {
    captures.get(key)?.capture.stop();
    captures.delete(key);
    setIssue(key);
  };
  return {
    setInputs: (inputs: CaptureInput[]) => {
      const required = new Map<string, number>();
      for (const input of inputs) {
        const key = deviceKey(input.deviceId);
        required.set(key, Math.max(required.get(key) ?? 2, input.channel ?? 2));
      }
      captures.forEach((_entry, key) => { if (!required.has(key)) remove(key); });
      required.forEach((channelCount, key) => {
        const existing = captures.get(key);
        if (existing) {
          existing.capture.requestChannels(channelCount);
          return;
        }
        const capture = createMicrophoneCapture({
          deviceId: key === "default" ? null : key,
          channelCount,
          devices,
          onStream: (stream, issue) => {
            const entry = captures.get(key);
            if (!entry) return;
            entry.stream = stream;
            setIssue(key, issue);
            onChange();
          }
        });
        captures.set(key, { capture, stream: null });
      });
    },
    streamFor: (deviceId: string | null) => captures.get(deviceKey(deviceId))?.stream,
    stop: () => captures.forEach((_entry, key) => remove(key))
  };
};

import { getCursorFreeStream } from "./cursorFreeCapture";

export const getDisplayStream = async (
  sourceId: string,
  includeAudio: boolean
) => {
  const captureCursor = "never";
  const cursorFreeStream = await getCursorFreeStream(sourceId);
  if (cursorFreeStream && !includeAudio) return cursorFreeStream;
  const constraints = {
    audio: includeAudio
      ? {
          mandatory: {
            chromeMediaSource: "desktop",
            chromeMediaSourceId: sourceId
          }
        }
      : false,
    video: {
      mandatory: {
        chromeMediaSource: "desktop",
        chromeMediaSourceId: sourceId
      },
      cursor: captureCursor
    }
  } as MediaStreamConstraints;

  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia(constraints);
  } catch (error) {
    stopMediaStream(cursorFreeStream);
    throw error;
  }
  if (cursorFreeStream) {
    stream.getVideoTracks().forEach((track) => track.stop());
    stream.getAudioTracks().forEach((track) => cursorFreeStream.addTrack(track));
    return cursorFreeStream;
  }
  // Desktop capture can ignore the initial cursor hint; apply it to the live track too.
  await Promise.all(stream.getVideoTracks().map(async (track) => {
    try {
      await track.applyConstraints({ cursor: captureCursor } as MediaTrackConstraints);
    } catch {
      // Older capture backends only support the initial acquisition constraints.
    }
  }));
  return stream;
};

export const getCameraStream = async (deviceId: string) => {
  return navigator.mediaDevices.getUserMedia({
    video: deviceId ? { deviceId: { exact: deviceId } } : true,
    audio: false
  });
};

export const stopMediaStream = (stream: MediaStream | null) => {
  if (!stream) {
    return;
  }
  stream.getTracks().forEach((track) => track.stop());
};

export const pickSupportedRecorderMimeType = (
  preferred: string[],
  isSupported: (mimeType: string) => boolean = (mimeType) => MediaRecorder.isTypeSupported(mimeType)
) => {
  for (const type of preferred) {
    if (isSupported(type)) return type;
  }
  return "";
};

export const pickRecorderMimeType = () => pickSupportedRecorderMimeType([
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm"
  ]);

export const pickStreamingRecorderMimeType = () => pickSupportedRecorderMimeType([
  "video/webm;codecs=vp8,opus",
  "video/webm;codecs=vp9,opus",
  "video/webm"
]);

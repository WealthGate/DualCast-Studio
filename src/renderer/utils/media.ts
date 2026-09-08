export const getDisplayStream = async (
  sourceId: string,
  includeAudio: boolean,
  captureCursor: "never" | "motion" | "always" = "never"
) => {
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

  return navigator.mediaDevices.getUserMedia(constraints);
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

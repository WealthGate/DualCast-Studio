export const getDisplayStream = async (sourceId: string, includeAudio: boolean) => {
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
      }
    }
  } as MediaStreamConstraints;

  return navigator.mediaDevices.getUserMedia(constraints);
};

export const stopMediaStream = (stream: MediaStream | null) => {
  if (!stream) {
    return;
  }
  stream.getTracks().forEach((track) => track.stop());
};

export const pickRecorderMimeType = () => {
  const preferred = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm"
  ];

  for (const type of preferred) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }

  return "";
};

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

const CAMERA_PREFIX = "camera:";

export const buildCameraSourceId = (deviceId: string) => `${CAMERA_PREFIX}${deviceId}`;

export const parseCameraSourceId = (sourceId: string) => {
  if (!sourceId.startsWith(CAMERA_PREFIX)) {
    return null;
  }
  return sourceId.slice(CAMERA_PREFIX.length);
};

export const getCameraStream = async (deviceId: string) => {
  return navigator.mediaDevices.getUserMedia({
    video: deviceId ? { deviceId: { exact: deviceId } } : true,
    audio: false
  });
};

export const getMediaStream = async (sourceId: string, includeAudio: boolean) => {
  const cameraId = parseCameraSourceId(sourceId);
  if (cameraId) {
    return getCameraStream(cameraId);
  }
  return getDisplayStream(sourceId, includeAudio);
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

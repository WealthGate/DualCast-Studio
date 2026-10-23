import { getCursorFreeStream } from "./cursorFreeCapture";
import type { StreamingEncoder } from "../../shared/types";
import { unprocessedAudioConstraints } from "../../shared/programAudio";

export const getDisplayStream = async (
  sourceId: string,
  includeAudio: boolean,
  fps = 30,
  maxWidth = 1920,
  maxHeight = 1080,
  encoder: StreamingEncoder = "auto"
) => {
  const captureCursor = "never";
  const cursorFreeStream = await getCursorFreeStream(sourceId, fps, maxWidth, maxHeight, encoder);
  if (cursorFreeStream && !includeAudio) return cursorFreeStream;
  const constraints = {
    audio: includeAudio
      ? {
          ...unprocessedAudioConstraints(),
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
      cursor: captureCursor,
      frameRate: { ideal: fps, max: fps }
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

export const getCameraStream = async (deviceId: string, fps = 30, width = 1920, height = 1080) => {
  return navigator.mediaDevices.getUserMedia({
    video: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), frameRate: { ideal: fps, max: fps }, width: { ideal: width }, height: { ideal: height } },
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

export const pickRecorderMimeType = (width = 1920) => pickSupportedRecorderMimeType(width > 4096 ? [
    "video/webm;codecs=av1,opus",
    "video/webm;codecs=vp9,opus"
  ] : [
    "video/webm;codecs=h264,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=vp9,opus",
    "video/webm"
  ]);

export const pickStreamingRecorderMimeType = (width = 1920) => pickRecorderMimeType(width);

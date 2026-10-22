import { createFrameDecoder } from "./frameDecoder";
import { createVideoFrameDecoder } from "./videoFrameDecoder";
import type { StreamingEncoder } from "../../shared/types";

const captureCanvases = new WeakMap<MediaStream, HTMLCanvasElement>();
const directStreams = new WeakSet<MediaStream>();
const versions = new WeakMap<HTMLCanvasElement, number>();
export const nativeCaptureVersion = (canvas: HTMLCanvasElement) => versions.get(canvas) ?? 0;
export const getNativeCaptureCanvas = (stream: MediaStream) => { directStreams.add(stream); return captureCanvases.get(stream); };

// Convert cursor-free native frames into the same MediaStream used by the
// compositor, so projection, recording and streaming share identical pixels.
export const getCursorFreeStream = async (sourceId: string, fps = 30, maxWidth = 1920, maxHeight = 1080, encoder: StreamingEncoder = "auto", legacy = false): Promise<MediaStream | null> => {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Screen capture canvas is unavailable.");
  let id: string | null = null;
  let stopped = false;
  let stream: MediaStream | null = null;
  let rejectReady: (error: Error) => void = () => undefined;
  let resolveReady: () => void = () => undefined;
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const stop = () => {
    if (stopped) return;
    stopped = true;
    decoder.stop();
    videoDecoder.stop();
    clearTimeout(timeout);
    unsubscribe();
    if (id) void window.dualcast.stopCursorFreeCapture(id).catch(() => undefined);
    stream?.getTracks().forEach((track) => track.stop());
  };
  const decoder = createFrameDecoder(image => {
    if (canvas.width !== image.width || canvas.height !== image.height) {
      canvas.width = image.width; canvas.height = image.height;
    }
    context.drawImage(image, 0, 0);
    versions.set(canvas, (versions.get(canvas) ?? 0) + 1);
    if (stream && !directStreams.has(stream)) (stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined)?.requestFrame?.();
    resolveReady();
  });
  const videoDecoder = createVideoFrameDecoder(frame => {
    if (canvas.width !== frame.displayWidth || canvas.height !== frame.displayHeight) {
      canvas.width = frame.displayWidth; canvas.height = frame.displayHeight;
    }
    context.drawImage(frame, 0, 0);
    versions.set(canvas, (versions.get(canvas) ?? 0) + 1);
    if (stream && !directStreams.has(stream)) (stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack | undefined)?.requestFrame?.();
    resolveReady();
  }, error => {
    rejectReady(error);
    stream?.getVideoTracks().forEach(track => track.dispatchEvent(new Event("ended")));
    stop();
  });
  const unsubscribe = window.dualcast.onCursorFreeFrame((frame) => {
    if (frame.id !== id || stopped) return;
    if (frame.data) { videoDecoder.decode(frame); return; }
    if (!frame.dataUrl) {
      rejectReady(new Error(frame.error || "Cursor-free screen capture ended."));
      stream?.getVideoTracks().forEach(track => track.dispatchEvent(new Event("ended")));
      stop();
      return;
    }
    return decoder.decode(frame.dataUrl);
  });
  const timeout = setTimeout(() => {
    rejectReady(new Error("Cursor-free screen capture timed out."));
    stop();
  }, 10000);
  // Attach a handler immediately, including while awaiting the IPC response.
  void ready.catch(() => undefined);
  try {
    const video = !legacy && typeof VideoDecoder !== "undefined";
    id = await window.dualcast.startCursorFreeCapture(sourceId, fps, { format: video ? "h264" : "jpeg", maxWidth, maxHeight, encoder });
    if (stopped) {
      if (id) void window.dualcast.stopCursorFreeCapture(id).catch(() => undefined);
      throw new Error("Cursor-free screen capture timed out.");
    }
    if (!id) { stop(); return null; }
    await ready;
    if (stopped) throw new Error("Cursor-free screen capture ended.");
    clearTimeout(timeout);
    stream = canvas.captureStream(0);
    captureCanvases.set(stream, canvas);
    (stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack).requestFrame?.();
    for (const track of stream.getVideoTracks()) {
      const originalStop = track.stop.bind(track);
      track.stop = () => { originalStop(); stop(); };
    }
    return stream;
  } catch (error) {
    stop();
    if (!legacy && encoder === "auto" && typeof VideoDecoder !== "undefined") return getCursorFreeStream(sourceId, fps, maxWidth, maxHeight, encoder, true);
    throw error;
  }
};

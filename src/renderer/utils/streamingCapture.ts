import type { StreamingPreset } from "../../shared/types";
import { onCanvasFrame } from "./canvasFrames";
import { createFrameCadence } from "./frameCadence";

export const streamingCaptureSize = (width: number, height: number, preset: StreamingPreset) => {
  const scale = Math.min(1, (preset === "low" ? 1280 : 1920) / width, (preset === "low" ? 720 : 1080) / height);
  return { width: Math.max(2, Math.floor(width * scale / 2) * 2), height: Math.max(2, Math.floor(height * scale / 2) * 2) };
};

// Downscale before browser encoding; capturing the full Program canvas wastes
// both VP8 encoding and FFmpeg decoding work for pixels the output never uses.
export const createStreamingCapture = (source: HTMLCanvasElement, preset: StreamingPreset, fps: number) => {
  const canvas = document.createElement("canvas");
  const size = streamingCaptureSize(source.width, source.height, preset);
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d", { alpha: false });
  if (!context) throw new Error("Streaming capture is unavailable.");
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
  const shouldDraw = createFrameCadence(fps);
  const draw = (now: number) => {
    if (!shouldDraw(now)) return;
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    track.requestFrame();
  };
  draw(performance.now());
  const unsubscribe = onCanvasFrame(source, draw, fps);
  return {
    stream,
    stop: () => {
      unsubscribe();
      stream.getTracks().forEach((track) => track.stop());
    }
  };
};

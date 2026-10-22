import type { StreamingPreset } from "../../shared/types";
import { onCanvasFrame } from "./canvasFrames";
import { createFrameCadence } from "./frameCadence";

export const streamingCaptureSize = (width: number, height: number, preset: StreamingPreset) => {
  const scale = Math.min(1, (preset === "low" ? 1280 : 1920) / width, (preset === "low" ? 720 : 1080) / height);
  return { width: Math.max(2, Math.floor(width * scale / 2) * 2), height: Math.max(2, Math.floor(height * scale / 2) * 2) };
};
type Capture = { stream: MediaStream; unsubscribe: () => void; references: number };
const captures = new WeakMap<HTMLCanvasElement, Map<string, Capture>>();

// Share identical conversion work between local projection and streaming.
// Each consumer owns cloned tracks, so stopping a stream cannot stop a display.
export const createStreamingCapture = (source: HTMLCanvasElement, preset: StreamingPreset, fps: number) => {
  const size = streamingCaptureSize(source.width, source.height, preset);
  const key = `${size.width}:${size.height}:${fps}`;
  const entries = captures.get(source) ?? new Map<string, Capture>();
  captures.set(source, entries);
  let capture = entries.get(key);
  if (!capture) {
    const canvas = document.createElement("canvas");
    canvas.width = size.width; canvas.height = size.height;
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
    capture = { stream, unsubscribe: onCanvasFrame(source, draw, fps), references: 0 };
    entries.set(key, capture);
  }
  const current = capture;
  current.references++;
  const stream = current.stream.clone?.() ?? current.stream;
  let stopped = false;
  return { stream, stop: () => {
    if (stopped) return;
    stopped = true;
    if (stream !== current.stream) stream.getTracks().forEach(track => track.stop());
    if (--current.references === 0) {
      current.unsubscribe(); current.stream.getTracks().forEach(track => track.stop());
      entries.delete(key); if (!entries.size) captures.delete(source);
    }
  } };
};

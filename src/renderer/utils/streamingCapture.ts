import type { StreamingPreset, VideoResolution } from "../../shared/types";
import { resolutionSize } from "../../shared/recording";
import { onCanvasFrame } from "./canvasFrames";
import { createFrameCadence } from "./frameCadence";

export const streamingCaptureSize = (width: number, height: number, preset: StreamingPreset, resolution?: VideoResolution) => {
  const bounds = resolutionSize(resolution, { width: preset === "low" ? 1280 : 1920, height: preset === "low" ? 720 : 1080 });
  const scale = Math.min(1, bounds.width / width, bounds.height / height);
  return { width: Math.max(2, Math.floor(width * scale / 2) * 2), height: Math.max(2, Math.floor(height * scale / 2) * 2) };
};
type Capture = { stream: MediaStream; unsubscribe: () => void; references: number; stats: { accepted: number; busyDrops: number; cadenceDrops: number; maxWriteMs: number } };
type GeneratedTrack = MediaStreamTrack & { writable: WritableStream<VideoFrame> };
type GeneratorConstructor = new (options: { kind: "video" }) => GeneratedTrack;
const captures = new WeakMap<HTMLCanvasElement, Map<string, Capture>>();

// Share identical conversion work between local projection and streaming.
// Each consumer owns cloned tracks, so stopping a stream cannot stop a display.
export const createStreamingCapture = (source: HTMLCanvasElement, preset: StreamingPreset, fps: number, resolution?: VideoResolution) => {
  const size = streamingCaptureSize(source.width, source.height, preset, resolution);
  const key = `${size.width}:${size.height}:${fps}`;
  const entries = captures.get(source) ?? new Map<string, Capture>();
  captures.set(source, entries);
  let capture = entries.get(key);
  if (!capture) {
    const canvas = document.createElement("canvas");
    canvas.width = size.width; canvas.height = size.height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("Streaming capture is unavailable.");
    const Generator = (globalThis as typeof globalThis & { MediaStreamTrackGenerator?: GeneratorConstructor }).MediaStreamTrackGenerator;
    const generated = Generator ? new Generator({ kind: "video" }) : null;
    const writer = generated?.writable.getWriter();
    const stream = generated ? new MediaStream([generated]) : canvas.captureStream(0);
    const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
    let writing = 0, stopped = false;
    const stats = {accepted:0,busyDrops:0,cadenceDrops:0,maxWriteMs:0};
    const shouldDraw = createFrameCadence(fps);
    const draw = (now: number) => {
      // The initial frame must also seed the cadence. Accepting another
      // compositor callback immediately afterwards can put two H.264 frames
      // into the same millisecond WebM timestamp at stream startup.
      if (!shouldDraw(now)) { stats.cadenceDrops++; return; }
      if (stopped || writing >= 3) { stats.busyDrops++; return; }
      stats.accepted++;
      const frameSource = writer && source.width === size.width && source.height === size.height ? source : canvas;
      if (frameSource === canvas) context.drawImage(source, 0, 0, canvas.width, canvas.height);
      if (writer) {
        writing++;
        const began=performance.now();
        const frame = new VideoFrame(frameSource, { timestamp: Math.round(now * 1000) });
        void writer.write(frame).catch(() => undefined).finally(() => { frame.close(); writing--; stats.maxWriteMs=Math.max(stats.maxWriteMs,performance.now()-began); });
      } else track.requestFrame();
    };
    draw(performance.now());
    const off = onCanvasFrame(source, draw, fps);
    capture = { stream, unsubscribe: () => { stopped = true; off(); void writer?.close().catch(() => undefined); }, references: 0, stats };
    entries.set(key, capture);
  }
  const current = capture;
  current.references++;
  const stream = current.stream.clone?.() ?? current.stream;
  let stopped = false;
  return { stream, stats:current.stats, stop: () => {
    if (stopped) return;
    stopped = true;
    if (stream !== current.stream) stream.getTracks().forEach(track => track.stop());
    if (--current.references === 0) {
      current.unsubscribe(); current.stream.getTracks().forEach(track => track.stop());
      entries.delete(key); if (!entries.size) captures.delete(source);
    }
  } };
};

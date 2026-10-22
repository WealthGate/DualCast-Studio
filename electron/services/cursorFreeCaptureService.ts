import { desktopCapturer, screen, WebContents } from "electron";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { randomUUID } from "crypto";
import bundledFfmpegPath from "ffmpeg-static";
import { resolveFfmpegExecutablePath } from "./ffmpegPathService";
import { getWindowsCaptureExecutable } from "./windowsCapturePathService";
import { IpcChannels } from "../../src/shared/ipc";
import { createLatestFrameRelay } from "./latestFrameRelay";

const captures = new Map<string, { owner: number; process: ChildProcessWithoutNullStreams; relay: ReturnType<typeof createLatestFrameRelay> }>();
export const acknowledgeCursorFreeFrame = (ownerId: number, id: string, sequence: number) => {
  const capture = captures.get(id);
  if (capture?.owner === ownerId) capture.relay.acknowledge(sequence);
};
export const stopCursorFreeCapture = (id: string, owner?: number) => {
  const entry = captures.get(id);
  if (!entry || (owner !== undefined && owner !== entry.owner)) return;
  captures.delete(id);
  entry.process.kill();
};

export const stopAllCursorFreeCaptures = () => {
  for (const id of captures.keys()) stopCursorFreeCapture(id);
};

// The legacy Chromium desktop capturer composes the cursor regardless of the
// renderer cursor constraint. GDI excludes it at acquisition, including over
// windows owned by other applications; the operator's real pointer is untouched.
export const startCursorFreeCapture = async (owner: WebContents, sourceId: string, requestedFps = 30) => {
  if (process.platform !== "win32") return null;
  if (typeof sourceId !== "string") throw new Error("Invalid capture source.");
  const fps = Number.isFinite(requestedFps) ? Math.max(1, Math.min(60, Math.round(requestedFps))) : 30;
  const isWindow = sourceId.startsWith("window:");
  const executable = isWindow ? getWindowsCaptureExecutable() : resolveFfmpegExecutablePath(bundledFfmpegPath);
  if (!executable) throw new Error("Screen capture executable is unavailable.");
  const sources = await desktopCapturer.getSources({ types: ["screen", "window"], thumbnailSize: { width: 0, height: 0 } });
  const source = sources.find((item) => item.id === sourceId);
  if (!source || owner.isDestroyed()) throw new Error("Capture source is unavailable.");
  let input;
  if (isWindow) {
    const handle = /^window:(\d+):\d+$/.exec(sourceId)?.[1];
    if (!handle) throw new Error("Invalid window capture handle.");
    input = ["-filter_complex", `gfxcapture=hwnd=${handle}:capture_cursor=0:capture_border=0:display_border=0:max_framerate=${fps}:width=1920:height=1080:resize_mode=scale_aspect,hwdownload,format=bgra`];
  } else {
    const display = screen.getAllDisplays().find((item) => String(item.id) === source.display_id);
    if (!display) throw new Error("Capture display is unavailable.");
    const bounds = screen.dipToScreenRect(null, display.bounds);
    input = ["-f", "gdigrab", "-draw_mouse", "0", "-framerate", String(fps), "-offset_x", String(bounds.x), "-offset_y", String(bounds.y), "-video_size", `${bounds.width}x${bounds.height}`, "-i", "desktop"];
  }
  const id = randomUUID();
  const child = spawn(executable, ["-hide_banner", "-loglevel", "error", "-filter_threads", "1", "-filter_complex_threads", "1", ...input,
    "-an", ...(isWindow ? [] : ["-vf", "scale=w='min(1920,iw)':h=-2"]), "-c:v", "mjpeg", "-pix_fmt", "yuvj420p", "-q:v", "3", "-threads", "1", "-f", "image2pipe", "pipe:1"], { windowsHide: true });
  const relay = createLatestFrameRelay(frame => { if (!owner.isDestroyed()) owner.send(IpcChannels.cursorFreeFrame, { id, ...frame }); });
  captures.set(id, { owner: owner.id, process: child, relay });
  const close = () => stopCursorFreeCapture(id);
  owner.once("destroyed", close);
  owner.once("render-process-gone", close);
  owner.once("did-start-navigation", close);
  let fragments: Buffer[] = [];
  let pendingBytes = 0;
  let previousByte = -1;
  const jpegEnd = Buffer.from([0xff, 0xd9]);
  child.stdout.on("data", (chunk: Buffer) => {
    if (!chunk.length) return;
    let start = 0;
    let marker = chunk.indexOf(jpegEnd);
    let end = previousByte === 0xff && chunk[0] === 0xd9 ? 1 : marker < 0 ? -1 : marker + 2;
    while (end >= 0) {
      fragments.push(chunk.subarray(start, end));
      pendingBytes += end - start;
      if (pendingBytes > 16 * 1024 * 1024) { close(); return; }
      const frame = fragments.length === 1 ? fragments[0] : Buffer.concat(fragments, pendingBytes);
      fragments = []; pendingBytes = 0; start = end;
      // Encode only the frame actually sent. Superseded pending frames never
      // allocate base64 strings or repeatedly copy partial multi-chunk JPEGs.
      if (!owner.isDestroyed()) relay.offer(() => `data:image/jpeg;base64,${frame.toString("base64")}`);
      marker = chunk.indexOf(jpegEnd, start);
      end = marker < 0 ? -1 : marker + 2;
    }
    previousByte = chunk[chunk.length - 1];
    if (start < chunk.length) { fragments.push(chunk.subarray(start)); pendingBytes += chunk.length - start; }
    if (pendingBytes > 16 * 1024 * 1024) close();
  });
  let lastError = "";
  child.stderr.on("data", (data: Buffer) => { lastError = (lastError + data.toString()).slice(-2000); });
  child.once("error", close);
  child.once("close", () => {
    const wasActive = captures.has(id);
    captures.delete(id);
    owner.removeListener("destroyed", close);
    owner.removeListener("render-process-gone", close);
    owner.removeListener("did-start-navigation", close);
    if (!owner.isDestroyed()) owner.send(IpcChannels.cursorFreeFrame, { id, dataUrl: null, ...(wasActive ? { error: lastError.trim() || "Capture window closed or became unavailable." } : {}) });
  });
  return id;
};

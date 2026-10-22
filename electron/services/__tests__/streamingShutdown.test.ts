import { EventEmitter } from "events";
import { PassThrough, Writable } from "stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), createWriteStream: vi.fn() }));
vi.mock("child_process", () => ({ spawn: mocks.spawn, spawnSync: () => ({ stdout: "", stderr: "" }) }));
vi.mock("electron", () => ({ app: { getPath: () => "test-data" } }));
vi.mock("ffmpeg-static", () => ({ default: "ffmpeg" }));
vi.mock("../ffmpegPathService", () => ({ resolveFfmpegExecutablePath: () => "ffmpeg" }));
vi.mock("../logger", () => ({ default: { info: vi.fn(), warn: vi.fn() } }));
vi.mock("fs", () => ({ default: { mkdirSync: vi.fn(), createWriteStream: mocks.createWriteStream } }));
import { buildFfmpegArgs, forceStopStreaming, sendStreamChunk, setStreamStatusPublisher, startStreaming, stopStreaming } from "../streamingService";

const payload = { rtmpUrl: "rtmp://example.com/live", streamKey: "key", hasAudio: false, preset: "medium" as const, fps: 30 as const, audioBitrate: 128 as const, encoder: "x264" as const };

const encoder = () => {
  let writeCallback: ((error?: Error | null) => void) | undefined;
  const process = Object.assign(new EventEmitter(), {
    stdin: new Writable({ write(_chunk, _encoding, callback) { writeCallback = callback; } }),
    stderr: new PassThrough(), exitCode: null as number | null, signalCode: null,
    kill: vi.fn()
  });
  return { process, failWrite: () => writeCallback?.(new Error("write EOF")) };
};

describe("stream shutdown", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mocks.createWriteStream.mockImplementation(() => new PassThrough());
  });
  afterEach(() => { forceStopStreaming(); vi.clearAllTimers(); vi.useRealTimers(); vi.clearAllMocks(); });

  it("handles asynchronous EOF on an in-flight write while stopping", async () => {
    const child = encoder();
    mocks.spawn.mockReturnValue(child.process);
    const publish = vi.fn();
    setStreamStatusPublisher(publish);
    expect(await startStreaming(payload)).toEqual({ ok: true });
    const pending = sendStreamChunk(new Uint8Array([1, 2, 3]));
    await Promise.resolve();
    const stopping = stopStreaming();
    child.failWrite();
    await pending;
    expect(await stopping).toEqual({ ok: true });
    // Let Writable emit its error event after invoking the failed write callback.
    await vi.runAllTicks();
    expect(publish.mock.lastCall?.[0].status).toBe("idle");
    expect(child.process.kill).not.toHaveBeenCalled();
    await sendStreamChunk(new Uint8Array([4]));
    vi.advanceTimersByTime(4000);
    expect(child.process.kill).toHaveBeenCalledWith("SIGKILL");
  });

  it("ignores old process events after a fresh stream has started", async () => {
    const old = encoder();
    const next = encoder();
    mocks.spawn.mockReturnValueOnce(old.process).mockReturnValueOnce(next.process);
    await startStreaming(payload);
    await stopStreaming();
    await startStreaming(payload);
    const publish = vi.fn();
    setStreamStatusPublisher(publish);
    publish.mockClear();
    old.process.stdin.emit("error", new Error("write EOF"));
    old.process.stderr.emit("data", "frame= 100 fps=30");
    old.process.emit("error", new Error("old process"));
    old.process.emit("close", 1, null);
    expect(publish).not.toHaveBeenCalled();
  });

  it("cancels the force-exit timeout when the encoder closes cleanly", async () => {
    const child = encoder();
    mocks.spawn.mockReturnValue(child.process);
    await startStreaming(payload);
    await stopStreaming();
    child.process.emit("close", 0, null);
    vi.advanceTimersByTime(4000);
    expect(child.process.kill).not.toHaveBeenCalled();
  });

  it("bounds a stalled encoder write rather than blocking every destination indefinitely", async () => {
    const child = encoder();
    mocks.spawn.mockReturnValue(child.process);
    await startStreaming(payload);
    child.process.stderr.emit("data", "frame= 30 fps=30 time=00:00:01.00");
    const pending = sendStreamChunk(new Uint8Array([1, 2, 3]));
    await vi.advanceTimersByTimeAsync(1500);
    await pending;
    expect(child.process.stdin.destroyed).toBe(true);
    expect(child.process.kill).toHaveBeenCalledWith("SIGINT");
  });

  it("allows bounded cold startup and retains its failure after recorder cleanup", async () => {
    const child = encoder(); mocks.spawn.mockReturnValue(child.process);
    const publish = vi.fn(); setStreamStatusPublisher(publish);
    await startStreaming(payload); await sendStreamChunk(new Uint8Array([1]));
    child.process.stderr.emit("data", "frame= 1 fps=0.0 time=00:00:00.00");
    await vi.advanceTimersByTimeAsync(1500);
    expect(child.process.stdin.destroyed).toBe(false);
    expect(publish.mock.lastCall?.[0].status).toBe("connecting");
    await vi.advanceTimersByTimeAsync(8500);
    expect(child.process.stdin.destroyed).toBe(true);
    expect(publish.mock.lastCall?.[0].status).toBe("error");
    expect(publish.mock.lastCall?.[0].lastError).toContain("startup timed out");
    await stopStreaming();
    expect(publish.mock.lastCall?.[0].status).toBe("error");
    const next = encoder(); mocks.spawn.mockReturnValue(next.process);
    await startStreaming(payload);
    expect(publish.mock.lastCall?.[0].status).toBe("connecting");
    expect(publish.mock.lastCall?.[0].lastError).toBeNull();
  });

  it("uses NV12, no lookahead/B-frames and shallow Quick Sync queues for live output", () => {
    const args = buildFfmpegArgs(payload, "qsv");
    expect(args[args.indexOf("-vf") + 1]).toContain("format=nv12");
    expect(args).not.toContain("yuv420p");
    expect(args[args.indexOf("-async_depth") + 1]).toBe("1");
    expect(args[args.indexOf("-look_ahead") + 1]).toBe("0");
    expect(args[args.indexOf("-bf") + 1]).toBe("0");
    expect(args[args.indexOf("-filter_threads") + 1]).toBe("1");
    expect(args.filter(value => value === "-threads")).toHaveLength(2);
    expect(args[args.indexOf("-flags:v") + 1]).toBe("+global_header");
  });

  it("recognizes sustained progress when FFmpeg batches carriage-return status lines", async () => {
    const child=encoder(); mocks.spawn.mockReturnValue(child.process);
    const publish=vi.fn();setStreamStatusPublisher(publish);await startStreaming(payload);
    child.process.stderr.emit("data","frame= 0 fps=0.0\rframe= 1 fps=0.0\rframe= 30 fps=30 time=00:00:01.00\r");
    expect(publish.mock.lastCall?.[0].status).toBe("live");
    expect(publish.mock.lastCall?.[0].stats.fps).toBe(30);
    await vi.advanceTimersByTimeAsync(10000);
    expect(child.process.kill).not.toHaveBeenCalled();
  });

  it("retains initial input packets and uses two-second keyframes with CBR output", async () => {
    const child = encoder();
    mocks.spawn.mockReturnValue(child.process);
    await startStreaming(payload);
    const args: string[] = mocks.spawn.mock.lastCall?.[1];
    expect(args).not.toContain("nobuffer");
    expect(args[args.indexOf("-g") + 1]).toBe("60");
    expect(args).toContain("nal-hrd=cbr:force-cfr=1");
    expect(args[args.indexOf("-fifo_options") + 1]).toContain("drop_pkts_on_overflow=1");
  });

  it("reports sub-real-time delivery and output overflow to the studio", async () => {
    const child = encoder();
    mocks.spawn.mockReturnValue(child.process);
    const publish = vi.fn();
    setStreamStatusPublisher(publish);
    await startStreaming(payload);
    child.process.stderr.emit("data", "frame= 100 fps=24 time=00:00:03.30 speed=0.81x");
    expect(publish.mock.lastCall?.[0].stats.speed).toBe(0.81);
    child.process.stderr.emit("data", "FIFO queue full");
    expect(publish.mock.lastCall?.[0].lastError).toContain("Recovering at the next");
    await vi.advanceTimersByTimeAsync(8000);
    child.process.stderr.emit("data", "frame= 300 fps=30 time=00:00:10.00 speed=1.01x");
    expect(publish.mock.lastCall?.[0].lastError).toBeNull();
  });

  it("reuses compatible H.264 without scaling, duplicating or encoding video a second time", () => {
    const args=buildFfmpegArgs({...payload,copyVideo:true,inputVideoCodec:"h264"},"x264");
    expect(args[args.indexOf("-c:v")+1]).toBe("copy");
    expect(args).not.toContain("-vf");expect(args).not.toContain("-r");expect(args).not.toContain("-preset");
    expect(buildFfmpegArgs({...payload,copyVideo:true,inputVideoCodec:"other"},"x264")).toContain("libx264");
  });

  it("recognizes stream-copy delivery without an encoded-frame counter", async () => {
    const child = encoder(); mocks.spawn.mockReturnValue(child.process);
    const publish = vi.fn(); setStreamStatusPublisher(publish);
    await startStreaming({ ...payload, copyVideo: true, inputVideoCodec: "h264" });
    child.process.stderr.emit("data", "size=0kB time=N/A bitrate=N/A speed=N/A");
    expect(publish.mock.lastCall?.[0].status).toBe("connecting");
    child.process.stderr.emit("data", "size=N/A time=00:00:01.00 bitrate=N/A speed=1.02x");
    expect(publish.mock.lastCall?.[0].status).toBe("live");
    await vi.advanceTimersByTimeAsync(10000);
    expect(child.process.kill).not.toHaveBeenCalled();
  });

  it("requests fresh input after a live stall instead of stopping automatic-recovery clients", async () => {
    const child=encoder();mocks.spawn.mockReturnValue(child.process);
    const publish=vi.fn();setStreamStatusPublisher(publish);await startStreaming({...payload,autoRecover:true});
    child.process.stderr.emit("data","frame= 30 fps=30 time=00:00:01.00");
    await sendStreamChunk(new Uint8Array([1]));await vi.advanceTimersByTimeAsync(1500);
    expect(publish.mock.lastCall?.[0].status).toBe("reconnecting");
    expect(publish.mock.lastCall?.[0].restartRequired).toBe(true);
    expect(child.process.kill).toHaveBeenCalledWith("SIGKILL");
    child.process.emit("close",1,null);
    expect(publish.mock.lastCall?.[0].status).toBe("reconnecting");
    await stopStreaming();
    const next=encoder();mocks.spawn.mockReturnValue(next.process);await startStreaming({...payload,autoRecover:true});
    expect(publish.mock.lastCall?.[0].restartRequired).toBe(false);
  });
});

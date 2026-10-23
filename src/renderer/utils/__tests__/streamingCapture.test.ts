import { afterEach, describe, expect, it, vi } from "vitest";
import { createStreamingCapture, streamingCaptureSize } from "../streamingCapture";
import { publishCanvasFrame, requestedCanvasFrameRate } from "../canvasFrames";

describe("streaming capture", () => {
  it("preserves explicit 8K and 4K dimensions without upscaling a smaller source", () => {
    expect(streamingCaptureSize(7680, 4320, "low", "8k")).toEqual({ width: 7680, height: 4320 });
    expect(streamingCaptureSize(7680, 4320, "low", "4k")).toEqual({ width: 3840, height: 2160 });
    expect(streamingCaptureSize(1920, 1080, "high", "8k")).toEqual({ width: 1920, height: 1080 });
  });
  it("bounds generated frame writes and closes frames after completion", async () => {
    const pending: (() => void)[] = [], frames: { close: ReturnType<typeof vi.fn> }[] = [];
    const writer = { write: vi.fn(() => new Promise<void>(resolve => pending.push(resolve))), close: vi.fn(() => Promise.resolve()) };
    const stop = vi.fn();
    vi.stubGlobal("MediaStreamTrackGenerator", class { writable = { getWriter: () => writer }; stop = stop; });
    vi.stubGlobal("MediaStream", class {
      constructor(public tracks: MediaStreamTrack[]) {}
      getVideoTracks() { return this.tracks; } getTracks() { return this.tracks; }
    });
    vi.stubGlobal("VideoFrame", class { close = vi.fn(); constructor() { frames.push(this); } });
    vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage: vi.fn() }) }) });
    const source = { width: 1920, height: 1080 } as HTMLCanvasElement;
    const capture = createStreamingCapture(source, "medium", 60), start = performance.now();
    for(let i=1;i<=10;i++) publishCanvasFrame(source, start+i*1000/60);
    expect(writer.write).toHaveBeenCalledTimes(3);
    expect(capture.stats.busyDrops).toBeGreaterThan(0);
    pending.splice(0).forEach(resolve => resolve());
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    frames.forEach(frame => expect(frame.close).toHaveBeenCalledOnce());
    capture.stop(); expect(writer.close).toHaveBeenCalledOnce(); expect(stop).toHaveBeenCalledOnce();
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  it("seeds initial frame cadence so immediate callbacks cannot collide in the browser timestamp time base", () => {
    vi.useFakeTimers();
    const requestFrame = vi.fn();
    const stream = { getVideoTracks: () => [{ requestFrame }], getTracks: () => [{ stop: vi.fn() }] };
    vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage: vi.fn() }), captureStream: () => stream }) });
    const source = { width: 320, height: 180 } as HTMLCanvasElement;
    const capture = createStreamingCapture(source, "low", 30);
    expect(requestFrame).toHaveBeenCalledOnce();
    publishCanvasFrame(source, performance.now() + .2);
    expect(requestFrame).toHaveBeenCalledOnce();
    publishCanvasFrame(source, performance.now() + 1000 / 30);
    expect(requestFrame).toHaveBeenCalledTimes(2);
    capture.stop();
  });

  it("downscales a 1440p Program canvas before browser encoding", () => {
    expect(streamingCaptureSize(2560, 1440, "high")).toEqual({ width: 1920, height: 1080 });
    expect(streamingCaptureSize(2560, 1440, "low")).toEqual({ width: 1280, height: 720 });
    expect(streamingCaptureSize(640, 480, "medium")).toEqual({ width: 640, height: 480 });
    expect(streamingCaptureSize(1080, 1920, "medium")).toEqual({ width: 606, height: 1080 });
  });
  it("shares conversion while keeping stream and projection lifetimes independent", () => {
    const drawImage = vi.fn(), stopBase = vi.fn(), stopFirst = vi.fn(), stopSecond = vi.fn();
    const base = { getVideoTracks: () => [{ requestFrame: vi.fn() }], getTracks: () => [{ stop: stopBase }], clone: vi.fn()
      .mockReturnValueOnce({ getTracks: () => [{ stop: stopFirst }] })
      .mockReturnValueOnce({ getTracks: () => [{ stop: stopSecond }] }) };
    const create = vi.fn(() => ({ width: 0, height: 0, getContext: () => ({ drawImage }), captureStream: () => base }));
    vi.stubGlobal("document", { createElement: create });
    const source = { width: 1920, height: 1080 } as HTMLCanvasElement;
    const first = createStreamingCapture(source, "low", 30), second = createStreamingCapture(source, "low", 30);
    expect(create).toHaveBeenCalledOnce();
    first.stop(); first.stop();
    expect(stopFirst).toHaveBeenCalledOnce(); expect(stopBase).not.toHaveBeenCalled();
    const count = drawImage.mock.calls.length;
    publishCanvasFrame(source, performance.now() + 100);
    expect(drawImage.mock.calls.length).toBeGreaterThan(count);
    second.stop(); expect(stopSecond).toHaveBeenCalledOnce(); expect(stopBase).toHaveBeenCalledOnce();
  });

  it("caps draw work at stream FPS and releases capture when stopped", () => {
    vi.useFakeTimers();
    const drawImage = vi.fn();
    const stop = vi.fn();
    const requestFrame = vi.fn();
    const track = { stop, requestFrame };
    const stream = { getTracks: () => [track], getVideoTracks: () => [track] };
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage }), captureStream: vi.fn(() => stream) };
    vi.stubGlobal("document", { createElement: () => canvas });
    const source = { width: 2560, height: 1440 } as HTMLCanvasElement;
    const capture = createStreamingCapture(source, "low", 30);
    expect(canvas).toMatchObject({ width: 1280, height: 720 });
    expect(canvas.captureStream).toHaveBeenCalledWith(0);
    expect(requestedCanvasFrameRate(source)).toBe(30);
    const start = performance.now();
    for (let i = 1; i <= 60; i++) publishCanvasFrame(source, start + i * 1000 / 60);
    expect(drawImage.mock.calls.length).toBeGreaterThanOrEqual(30);
    expect(drawImage.mock.calls.length).toBeLessThanOrEqual(32);
    capture.stop();
    const count = drawImage.mock.calls.length;
    expect(requestedCanvasFrameRate(source)).toBe(0);
    publishCanvasFrame(source, start + 2000);
    expect(drawImage).toHaveBeenCalledTimes(count);
    expect(stop).toHaveBeenCalledOnce();
    expect(requestFrame).toHaveBeenCalledTimes(count);
  });
});

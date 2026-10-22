import { afterEach, describe, expect, it, vi } from "vitest";
import { createStreamingCapture, streamingCaptureSize } from "../streamingCapture";
import { publishCanvasFrame, requestedCanvasFrameRate } from "../canvasFrames";

describe("streaming capture", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

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

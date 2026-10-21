import { afterEach, describe, expect, it, vi } from "vitest";
import { getCursorFreeStream } from "../cursorFreeCapture";

describe("cursor-free capture stream", () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

  const setup = (nativeId: string | null = "capture-1") => {
    let frame: (payload: { id: string; dataUrl: string | null }) => void = () => undefined;
    const unsubscribe = vi.fn();
    const stopNative = vi.fn(async () => undefined);
    const stopTrack = vi.fn();
    const track = { stop: stopTrack };
    const stream = { getVideoTracks: () => [track], getTracks: () => [track] };
    const drawImage = vi.fn();
    vi.stubGlobal("document", { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage }), captureStream: () => stream }) });
    vi.stubGlobal("Image", class {
      width = 1920; height = 1080;
      onload = () => undefined;
      set src(_value: string) { this.onload(); }
    });
    vi.stubGlobal("window", { dualcast: {
      onCursorFreeFrame: (callback: typeof frame) => { frame = callback; return unsubscribe; },
      startCursorFreeCapture: vi.fn(async () => nativeId),
      stopCursorFreeCapture: stopNative
    } });
    return { frame: (id = "capture-1", dataUrl: string | null = "data:image/jpeg;base64,test") => frame({ id, dataUrl }), unsubscribe, stopNative, stopTrack, track, drawImage };
  };

  it("draws only its own native frames and releases capture when stopped", async () => {
    const mocks = setup();
    const pending = getCursorFreeStream("screen:0:0");
    await Promise.resolve();
    mocks.frame("other-capture");
    expect(mocks.drawImage).not.toHaveBeenCalled();
    mocks.frame();
    const stream = await pending;
    expect(mocks.drawImage).toHaveBeenCalledOnce();
    stream!.getTracks()[0].stop();
    expect(mocks.stopNative).toHaveBeenCalledWith("capture-1");
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });
  it("cleans its subscription when the native backend is unavailable", async () => {
    const mocks = setup(null);
    expect(await getCursorFreeStream("screen:0:0")).toBeNull();
    expect(mocks.unsubscribe).toHaveBeenCalledOnce();
  });
  it("fails closed and releases capture if no native frames arrive", async () => {
    vi.useFakeTimers();
    const mocks = setup();
    const pending = getCursorFreeStream("screen:0:0");
    const rejected = expect(pending).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(10000);
    await rejected;
    expect(mocks.stopNative).toHaveBeenCalledWith("capture-1");
  });
});

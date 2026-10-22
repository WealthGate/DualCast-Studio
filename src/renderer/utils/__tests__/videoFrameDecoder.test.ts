import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createVideoFrameDecoder } from "../videoFrameDecoder";
import type { NativeCaptureFrame } from "../../../shared/types";

describe("bounded encoded frame decoding", () => {
  const instances: any[] = [];
  beforeEach(() => {
    instances.length = 0;
    vi.stubGlobal("EncodedVideoChunk", class { constructor(public data: unknown) {} });
    vi.stubGlobal("VideoDecoder", class {
      state = "configured"; decodeQueueSize = 0; configure = vi.fn(); decode = vi.fn(); close = vi.fn(() => { this.state = "closed"; });
      constructor(public callbacks: any) { instances.push(this); }
    });
  });
  afterEach(() => vi.unstubAllGlobals());
  const packet = (keyFrame = false): NativeCaptureFrame => ({ id: "test", dataUrl: null, data: new Uint8Array([1]), codec: "avc1.42002a", keyFrame, timestamp: 100 });
  it("waits for a keyframe and discards dependent frames after a congested decoder resets", () => {
    const decoder = createVideoFrameDecoder(vi.fn(), vi.fn());
    decoder.decode(packet()); expect(instances).toHaveLength(0);
    decoder.decode(packet(true)); expect(instances[0].decode).toHaveBeenCalledOnce();
    instances[0].decodeQueueSize = 5;
    decoder.decode(packet()); expect(instances[0].close).toHaveBeenCalledOnce();
    expect(instances).toHaveLength(1);
    decoder.decode(packet(true)); expect(instances).toHaveLength(2);
    decoder.stop(); expect(instances[1].close).toHaveBeenCalledOnce();
  });
  it("closes every decoded VideoFrame even when painting throws", () => {
    const decoder = createVideoFrameDecoder(() => { throw Error("paint"); }, vi.fn());
    decoder.decode(packet(true)); const frame = { close: vi.fn() };
    expect(() => instances[0].callbacks.output(frame)).toThrow("paint");
    expect(frame.close).toHaveBeenCalledOnce(); decoder.stop();
  });
  it("falls back from hardware decoding once and reports a repeated failure", () => {
    const fail = vi.fn(), decoder = createVideoFrameDecoder(vi.fn(), fail);
    decoder.decode(packet(true)); instances[0].callbacks.error(Error("driver"));
    expect(fail).not.toHaveBeenCalled(); decoder.decode(packet(true));
    expect(instances[1].configure).toHaveBeenCalledWith(expect.objectContaining({ hardwareAcceleration: "no-preference" }));
    instances[1].callbacks.error(Error("decoder")); expect(fail).toHaveBeenCalledOnce(); decoder.stop();
  });
});

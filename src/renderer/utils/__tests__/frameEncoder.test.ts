import { describe, expect, it, vi } from "vitest";
import { createFrameEncoder } from "../frameEncoder";

describe("projection encoding", () => {
  it("drops work while encoding and ignores a pending frame after stopping", () => {
    const send = vi.fn();
    let finish: BlobCallback = () => undefined;
    const toBlob = vi.fn((callback: BlobCallback) => { finish = callback; });
    const canvas = { width: 1920, height: 1080, toBlob } as unknown as HTMLCanvasElement;
    const encoder = createFrameEncoder(send);
    encoder.encode(canvas);
    encoder.encode(canvas);
    expect(toBlob).toHaveBeenCalledTimes(1);
    finish(null);
    encoder.encode(canvas);
    expect(toBlob).toHaveBeenCalledTimes(2);
    encoder.stop();
    finish(new Blob(["frame"]));
    encoder.encode(canvas);
    expect(send).not.toHaveBeenCalled();
    expect(toBlob).toHaveBeenCalledTimes(2);
  });
});

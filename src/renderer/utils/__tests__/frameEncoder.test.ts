import { describe, expect, it, vi } from "vitest";
import { createFrameEncoder } from "../frameEncoder";

describe("projection encoding", () => {
  it("immediately encodes the latest pending canvas after asynchronous completion", () => {
    const readers: { onload: () => void; result: string }[] = [];
    vi.stubGlobal("FileReader", class { result = "frame"; onload = () => {}; readAsDataURL() { readers.push(this); } });
    const send = vi.fn(); let finish: BlobCallback = () => {};
    const first = { width: 10, height: 10, toBlob: vi.fn((callback: BlobCallback) => { finish = callback; }) } as unknown as HTMLCanvasElement;
    const latest = { width: 10, height: 10, toBlob: vi.fn() } as unknown as HTMLCanvasElement;
    const encoder = createFrameEncoder(send);
    encoder.encode(first); encoder.encode(first); encoder.encode(latest);
    finish(new Blob(["frame"])); readers[0].onload();
    expect(send).toHaveBeenCalledOnce(); expect(latest.toBlob).toHaveBeenCalledOnce();
    encoder.stop(); vi.unstubAllGlobals();
  });
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

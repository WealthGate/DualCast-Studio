import { afterEach, describe, expect, it, vi } from "vitest";
import { createFrameDecoder } from "../frameDecoder";

afterEach(() => vi.unstubAllGlobals());
describe("live output decoding", () => {
  it("bounds decoding to one image and skips queued intermediate frames", () => {
    const images: { src: string; onload: () => void }[] = [];
    vi.stubGlobal("Image", class { src = ""; onload = () => undefined; constructor() { images.push(this); } });
    const draw = vi.fn();
    const decoder = createFrameDecoder(draw);
    decoder.decode("first"); decoder.decode("second"); decoder.decode("latest");
    expect(images).toHaveLength(1);
    images[0].onload();
    expect(images).toHaveLength(2);
    expect(images[1].src).toBe("latest");
    decoder.stop(); images[1].onload();
    expect(draw).toHaveBeenCalledOnce();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { createFrameDecoder } from "../frameDecoder";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("live output decoding", () => {
  const setup = () => {
    const images: { src: string; onload: (() => void) | null }[] = [];
    vi.stubGlobal("Image", class { src = ""; onload = () => undefined; constructor() { images.push(this); } });
    return images;
  };
  it("bounds decoding to one image and skips queued intermediate frames", () => {
    const images = setup(); const draw = vi.fn(); const decoder = createFrameDecoder(draw);
    decoder.decode("first"); decoder.decode("second"); decoder.decode("latest");
    expect(images).toHaveLength(1); images[0].onload!();
    expect(images).toHaveLength(2); expect(images[1].src).toBe("latest");
    const late = images[1].onload!; decoder.stop(); late();
    expect(draw).toHaveBeenCalledOnce();
  });
  it("acknowledges a stuck decode and immediately tries the latest frame", async () => {
    vi.useFakeTimers(); const images = setup(); const decoder = createFrameDecoder(vi.fn());
    const first = decoder.decode("stuck"); decoder.decode("latest");
    await vi.advanceTimersByTimeAsync(500); await first;
    expect(images[1].src).toBe("latest"); decoder.stop();
  });
  it("closes superseded decoded bitmaps and the final bitmap on stop", async () => {
    const first = { close: vi.fn() }, second = { close: vi.fn() };
    vi.stubGlobal("createImageBitmap", vi.fn().mockResolvedValueOnce(first).mockResolvedValueOnce(second));
    const decoder = createFrameDecoder(vi.fn());
    await decoder.decode("data:image/jpeg;base64,AA=="); expect(first.close).not.toHaveBeenCalled();
    await decoder.decode("data:image/jpeg;base64,AQ=="); expect(first.close).toHaveBeenCalledOnce();
    decoder.stop(); expect(second.close).toHaveBeenCalledOnce();
  });
});

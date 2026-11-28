import { afterEach, expect, it, vi } from "vitest";
import { createProgramVideoEncoder } from "../programVideoEncoder";

afterEach(() => vi.unstubAllGlobals());

it.each([1920, 3840])("paces 30 fps projection from a 60 fps, %i-pixel Program canvas", async width => {
  const source = { width, height: width * 9 / 16 } as HTMLCanvasElement;
  const drawImage = vi.fn();
  const canvas = { getContext: () => ({ drawImage }) };
  const frames: unknown[] = [];
  const configure = vi.fn();
  vi.stubGlobal("document", { createElement: () => canvas });
  vi.stubGlobal("VideoEncoder", class {
    static isConfigSupported = () => ({ supported: true });
    state = "configured";
    encodeQueueSize = 0;
    configure = configure;
    encode() {}
    close() {}
  });
  vi.stubGlobal("VideoFrame", class {
    constructor(input: unknown) { frames.push(input); }
    close() {}
  });
  const encoder = await createProgramVideoEncoder(source, 30, "1080p", vi.fn(), vi.fn());
  for (let i = 0; i < 120; i++) encoder.draw(i * 1000 / 60);
  encoder.stop();
  expect(configure).toHaveBeenCalledWith(expect.objectContaining({ width: 1920, height: 1080, framerate: 30 }));
  expect(frames).toHaveLength(60);
  expect(drawImage).toHaveBeenCalledTimes(width === 1920 ? 0 : 60);
  expect(frames.every(frame => frame === (width === 1920 ? source : canvas))).toBe(true);
});

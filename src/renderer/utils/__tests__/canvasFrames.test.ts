import { describe, expect, it, vi } from "vitest";
import { onCanvasFrame, publishCanvasFrame } from "../canvasFrames";

describe("output fan-out", () => {
  it("keeps streaming and projection running if another frame consumer throws", () => {
    const canvas = {} as HTMLCanvasElement; const next = vi.fn();
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const first = onCanvasFrame(canvas, () => { throw Error("Stopped consumer"); });
    const second = onCanvasFrame(canvas, next);
    publishCanvasFrame(canvas, 100);
    expect(next).toHaveBeenCalledWith(100);
    first(); second(); log.mockRestore();
  });
});

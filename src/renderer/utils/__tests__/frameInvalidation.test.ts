import { describe, expect, it } from "vitest";
import { createFrameInvalidation } from "../frameInvalidation";

describe("render invalidation", () => {
  it("avoids redundant large-canvas work but immediately draws new video frames", () => {
    const draw = createFrameInvalidation(); const source = {};
    expect(draw([source,1],0)).toBe(true);
    for(let now=1;now<250;now+=16) expect(draw([source,1],now)).toBe(false);
    expect(draw([source,2],249)).toBe(true);
    expect(draw([source,2],499)).toBe(true);
  });
  it("keeps animated layers at their requested cadence", () => {
    const draw = createFrameInvalidation();
    expect(draw([1],0,true)).toBe(true); expect(draw([1],16,true)).toBe(true);
  });
});

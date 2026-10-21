import { describe, expect, it } from "vitest";
import { createFrameCadence } from "../frameCadence";

describe("frame cadence", () => {
  it("keeps 30fps at exactly every second 60Hz refresh despite rounding", () => {
    const shouldDraw = createFrameCadence(30);
    const draws = Array.from({ length: 120 }, (_, index) => index).filter(index => shouldDraw(index * 1000 / 60));
    expect(draws).toHaveLength(60);
    expect(new Set(draws.slice(1).map((value, index) => value - draws[index]))).toEqual(new Set([2]));
  });
  it("skips missed frames instead of delivering a burst after a stall", () => {
    const shouldDraw = createFrameCadence(30);
    expect(shouldDraw(0)).toBe(true);
    expect(shouldDraw(1000)).toBe(true);
    expect(shouldDraw(1001)).toBe(false);
    expect(shouldDraw(1016)).toBe(false);
    expect(shouldDraw(1034)).toBe(true);
  });
});

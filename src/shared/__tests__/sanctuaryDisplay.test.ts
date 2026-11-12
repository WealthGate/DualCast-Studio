import { describe, expect, it } from "vitest";
import { defaultSanctuaryDisplay, normalizeSanctuaryDisplay } from "../sanctuaryDisplay";

describe("Sanctuary display settings", () => {
  it("keeps existing installations mirroring Program", () => {
    expect(normalizeSanctuaryDisplay()).toEqual(defaultSanctuaryDisplay);
    expect(normalizeSanctuaryDisplay(null)).toEqual(defaultSanctuaryDisplay);
  });
  it("constrains text to the display and rejects invalid dimensions", () => {
    const normalized = normalizeSanctuaryDisplay({ mode: "independent", fontSize: Infinity, backgroundDim: 3,
      textRect: { x: 99, y: -5, width: 500, height: NaN } });
    expect(normalized.mode).toBe("independent");
    expect(normalized.fontSize).toBe(72);
    expect(normalized.backgroundDim).toBe(1);
    expect(normalized.textRect).toEqual({ x: 95, y: 0, width: 5, height: 80 });
  });
});

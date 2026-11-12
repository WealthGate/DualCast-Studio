import { describe, expect, it } from "vitest";
import { formatElapsedTimer } from "../time";

describe("formatElapsedTimer", () => {
  it("formats elapsed seconds consistently", () => {
    expect(formatElapsedTimer(0)).toBe("00:00");
    expect(formatElapsedTimer(65)).toBe("01:05");
    expect(formatElapsedTimer(3_661)).toBe("61:01");
  });

  it("normalizes negative and fractional input", () => {
    expect(formatElapsedTimer(-10)).toBe("00:00");
    expect(formatElapsedTimer(9.9)).toBe("00:09");
  });
});

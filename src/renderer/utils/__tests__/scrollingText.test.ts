import { describe, expect, it } from "vitest";
import { defaultScrollingText } from "../../../shared/scrollingText";
import { scrollingPositions, scrollingTextLayout } from "../scrollingText";

describe("scrolling layout and movement", () => {
  it("reserves separate logo space on either side and scales with output", () => {
    const data = { ...defaultScrollingText, logoUrl: "logo.png" };
    const left = scrollingTextLayout(data, 1920, 130, 1);
    const right = scrollingTextLayout({ ...data, logoPosition: "right" }, 1920, 130, 1);
    expect(left.textX).toBeGreaterThan(left.padding + left.logoWidth);
    expect(right.textX + right.textWidth).toBeLessThan(1920 - right.padding - right.logoWidth);
    const small = scrollingTextLayout(data, 960, 65, 0.5);
    expect(small.textWidth).toBe(left.textWidth / 2);
    expect(scrollingTextLayout(data, 0.01, 0.01, 1).logoWidth).toBeGreaterThanOrEqual(0);
  });
  it("moves in both directions, loops without a jump, and runs once when requested", () => {
    expect(scrollingPositions(200, 500, 40, 50, false, true)[0]).toBe(-40);
    expect(scrollingPositions(200, 500, 40, 50, true, true)[0]).toBe(-210);
    expect(scrollingPositions(200, 500, 290, 50, false, true)).toEqual(scrollingPositions(200, 500, 40, 50, false, true));
    expect(scrollingPositions(200, 500, 800, 50, false, false)).toEqual([-300]);
    expect(scrollingPositions(200, 500, 800, 50, true, false)).toEqual([600]);
  });
});

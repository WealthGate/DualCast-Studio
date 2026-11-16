import { describe, expect, it } from "vitest";
import { sanctuaryTextKeyframes } from "../sanctuaryAnimation";
import type { LowerThirdAnimation } from "../../../shared/types";

describe("independent display animations", () => {
  it.each<LowerThirdAnimation>(["fade", "slide-left", "slide-right", "slide-up", "slide-down", "zoom", "wipe", "reveal", "spring"])("fully enters and exits with %s", animation => {
    const enter = sanctuaryTextKeyframes(animation), exit = sanctuaryTextKeyframes(animation, true);
    expect(enter[0].opacity).toBe(0); expect(enter.at(-1)?.opacity).toBe(1);
    expect(exit[0].opacity).toBe(1); expect(exit.at(-1)?.opacity).toBe(0);
  });
  it("respects None", () => { expect(sanctuaryTextKeyframes("none").every(frame => frame.opacity === 1)).toBe(true); });
});

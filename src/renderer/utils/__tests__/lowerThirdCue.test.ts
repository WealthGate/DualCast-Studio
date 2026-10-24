import { describe, expect, it } from "vitest";
import { createVisibilityTransition, emptyLowerThirdCue, updateLowerThirdCue } from "../lowerThirdCue";

describe("lower third exit cues", () => {
  it("retains the outgoing slide and text mode when hidden or cleared", () => {
    const slide = { id: "verse", text: "Live verse" };
    let cue = updateLowerThirdCue(emptyLowerThirdCue(), slide, "show", 0);
    cue = updateLowerThirdCue(cue, null, "show", 1000);
    expect(cue).toMatchObject({ previous: slide, current: null, changedAt: 1000 });
    expect(updateLowerThirdCue(cue, null, "show", 1200).changedAt).toBe(1000);
    expect(updateLowerThirdCue(cue, null, "theme", 1200)).toMatchObject({ previous: slide, previousMode: "show", changedAt: 1000 });
    cue = updateLowerThirdCue(emptyLowerThirdCue(), slide, "show", 0);
    expect(updateLowerThirdCue(cue, slide, "theme", 500)).toMatchObject({ previousMode: "show", mode: "theme", previous: slide, current: slide });
  });
  it("reverses a rapid hide/show smoothly without jumping opacity", () => {
    const transition = createVisibilityTransition();
    transition.set(false, 0, 400);
    expect(transition.value(200)).toBeCloseTo(0.5);
    transition.set(true, 200, 400);
    expect(transition.value(200)).toBeCloseTo(0.5);
    expect(transition.value(600)).toBe(1);
    expect(transition.active(600)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { createSceneWarmup } from "../sceneWarmup";

describe("scene warm-up continuity", () => {
  it("holds a cold TAKE briefly but never freezes an already-live scene", () => {
    const gate = createSceneWarmup(); const scene = {};
    expect(gate(scene, false, 0)).toBe(false);
    expect(gate(scene, true, 350)).toBe(true);
    expect(gate(scene, false, 400)).toBe(true);
    expect(gate(scene, false, 5000)).toBe(true);
  });
  it("lets healthy layers play even if a new source never becomes ready", () => {
    const gate = createSceneWarmup(); const scene = {};
    expect(gate(scene, false, 100)).toBe(false);
    expect(gate(scene, false, 850)).toBe(true);
    expect(gate({}, false, 900)).toBe(false);
  });

  it("keeps waiting after the timeout if no media layer has a picture", () => {
    const gate = createSceneWarmup();
    const scene = {};
    expect(gate(scene, false, 0, false)).toBe(false);
    expect(gate(scene, true, 1500, false)).toBe(false);
    expect(gate(scene, true, 2000, true)).toBe(true);
    expect(gate(scene, false, 2100, false)).toBe(false);
    expect(gate(scene, false, 2200, true)).toBe(true);
  });
});

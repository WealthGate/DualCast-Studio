import { describe, expect, it } from "vitest";
import { stateForDisplay } from "../displayBackgroundState";
import { defaultSanctuaryDisplay } from "../sanctuaryDisplay";
import { emptyBackground } from "../backgrounds";
import { ProgramState } from "../types";
describe("per-display backgrounds", () => {
  it("routes an override only to its monitor and leaves Program untouched", () => {
    const state: ProgramState = { programSceneId: "live", isCutToBlack: false, isFrozen: false, qualityPreset: "medium", sanctuary: { settings: defaultSanctuaryDisplay, text: "Verse", reference: "", textMode: "show", logoUrl: "" }, backgrounds: { displays: { "123": { ...emptyBackground, kind: "video", url: "file:///loop.mp4" } } } };
    expect(stateForDisplay(state, "123").sanctuary).toMatchObject({ settings: { mode: "independent" }, background: { url: "file:///loop.mp4" }, text: "Verse" });
    expect(stateForDisplay(state, "456")).toBe(state); expect(state.sanctuary?.settings.mode).toBe("program");
  });
});

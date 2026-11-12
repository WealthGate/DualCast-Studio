import { describe, expect, it } from "vitest";
import { explicitDisplayRouting, modeForDisplay, stateForDisplay } from "../displayBackgroundState";
import { defaultSanctuaryDisplay } from "../sanctuaryDisplay";
import { emptyBackground } from "../backgrounds";
import { ProgramState } from "../types";
describe("per-display backgrounds", () => {
  it("makes an explicit Mirror Program choice override saved backgrounds without deleting them", () => {
    const backgrounds = { sanctuary: { ...emptyBackground, kind: "image" as const, url: "file:///shared.png" }, displays: { "1": { ...emptyBackground, kind: "video" as const, url: "file:///own.webm" } } };
    const config = { ...defaultSanctuaryDisplay, mode: "program" as const, displayModes: {} };
    expect(modeForDisplay(config, backgrounds, "1")).toBe("program"); expect(modeForDisplay(config, backgrounds, "2")).toBe("program");
    const state: ProgramState = { programSceneId: "live", isCutToBlack: false, isFrozen: false, qualityPreset: "medium", sanctuary: { settings: config, text: "Live", reference: "", textMode: "show", logoUrl: "" }, backgrounds };
    expect(stateForDisplay(state, "1").sanctuary?.settings.mode).toBe("program"); expect(backgrounds.displays["1"].kind).toBe("video");
    expect(modeForDisplay({ ...config, mode: "independent" }, backgrounds, "1")).toBe("independent");
  });
  it("migrates legacy assignments and resolves one screen's explicit mode independently", () => {
    const backgrounds = { displays: { "1": emptyBackground } };
    const routing = explicitDisplayRouting(defaultSanctuaryDisplay, backgrounds);
    expect(routing.displayModes).toEqual({ "1": "independent" });
    expect(modeForDisplay(routing, backgrounds, "1")).toBe("independent"); expect(modeForDisplay(routing, backgrounds, "2")).toBe("program");
    expect(modeForDisplay({ ...routing, mode: "independent", displayModes: { "1": "program" } }, backgrounds, "1")).toBe("program");
  });
  it("routes an override only to its monitor and leaves Program untouched", () => {
    const state: ProgramState = { programSceneId: "live", isCutToBlack: false, isFrozen: false, qualityPreset: "medium", sanctuary: { settings: defaultSanctuaryDisplay, text: "Verse", reference: "", textMode: "show", logoUrl: "" }, backgrounds: { displays: { "123": { ...emptyBackground, kind: "video", url: "file:///loop.mp4" } } } };
    expect(stateForDisplay(state, "123").sanctuary).toMatchObject({ settings: { mode: "independent" }, background: { url: "file:///loop.mp4" }, text: "Verse" });
    expect(stateForDisplay(state, "456")).toBe(state); expect(state.sanctuary?.settings.mode).toBe("program");
  });
});

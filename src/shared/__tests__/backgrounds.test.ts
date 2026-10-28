import { describe, expect, it } from "vitest";
import { emptyBackground, normalizeBackground, normalizeDisplayBackgrounds, withoutBackgroundMedia } from "../backgrounds";
describe("background selections", () => {
  it("clears deleted media by ID or URL across outputs while preserving colors, overrides and other files", () => {
    const selected = { ...emptyBackground, kind: "video" as const, assetId: "deleted", url: "file:///loop.webm", color: "#123456" };
    const backgrounds = { program: selected, sanctuary: selected, lowerThird: { ...selected, assetId: "" }, displays: { "1": selected, "2": { ...emptyBackground, kind: "image" as const, url: "file:///other.png" } } };
    const result = withoutBackgroundMedia(backgrounds, { id: "deleted", url: selected.url });
    for (const selection of [result.program, result.sanctuary, result.lowerThird, result.displays["1"]]) expect(selection).toMatchObject({ kind: "none", assetId: "", url: "", color: "#123456" });
    expect(result.displays["2"]).toEqual(backgrounds.displays["2"]); expect(backgrounds.program.kind).toBe("video");
  });
  it("clears media when None is selected and bounds saved values", () => {
    expect(normalizeBackground({ kind: "none", url: "file:///old.mp4", opacity: NaN })).toMatchObject({ kind: "none", url: "", opacity: 1 });
    expect(normalizeBackground({ kind: "video", url: "file:///loop.mp4", opacity: 5, fit: "contain" })).toMatchObject({ kind: "video", opacity: 1, fit: "contain" });
  });
  it("retains separate display assignments and distinguishes None from inheritance", () => {
    const settings = normalizeDisplayBackgrounds({ sanctuary: { kind: "image", url: "file:///all.png" }, displays: { "123": { kind: "none" }, "456": { kind: "video", url: "file:///other.mp4" } } });
    expect(settings.displays["123"].kind).toBe("none"); expect(settings.displays["456"].url).toBe("file:///other.mp4");
    expect(settings.displays["789"]).toBeUndefined(); expect(settings.sanctuary?.kind).toBe("image");
  });
});

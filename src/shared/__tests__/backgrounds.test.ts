import { describe, expect, it } from "vitest";
import { normalizeBackground, normalizeDisplayBackgrounds } from "../backgrounds";
describe("background selections", () => {
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

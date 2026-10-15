import { describe, expect, it } from "vitest";
import { createStudioProfile, normalizeProfileName, parseStudioProfiles } from "../profiles";

const settings = {
  streamDestinations: [],
  studioState: { scenes: [], sources: {}, groups: [], previewSceneId: null, programSceneId: null }
} as never;

describe("studio profiles", () => {
  it("creates filesystem-safe display names", () => {
    expect(normalizeProfileName(' Sunday: Main / 1080p ')).toBe("Sunday Main 1080p");
  });

  it("round-trips valid profiles and ignores malformed entries", () => {
    const profile = createStudioProfile("Sunday", settings, "profile-1", new Date("2026-01-01T00:00:00Z"));
    expect(parseStudioProfiles(JSON.stringify([profile, { name: "broken" }]))).toEqual([profile]);
  });
});

import { describe, expect, it } from "vitest";
import {
  buildYouTubeBroadcastResource,
  buildYouTubeStreamResource,
  DEFAULT_YOUTUBE_BROADCAST_SETTINGS,
  normalizeYouTubeBroadcastSettings,
  validateYouTubeBroadcastSettings
} from "../streamingPlatforms";

describe("YouTube broadcast setup", () => {
  it("normalizes untrusted saved choices to safe defaults", () => {
    const settings = normalizeYouTubeBroadcastSettings({
      title: "x".repeat(120),
      visibility: "friends" as never,
      categoryId: "invalid",
      latencyPreference: "instant" as never,
      enableDvr: false
    });

    expect(settings.title).toHaveLength(100);
    expect(settings.visibility).toBe("unlisted");
    expect(settings.categoryId).toBe("29");
    expect(settings.latencyPreference).toBe("low");
    expect(settings.enableDvr).toBe(false);
  });

  it("requires a title and a future scheduled start", () => {
    const now = Date.parse("2026-08-23T12:00:00.000Z");
    expect(validateYouTubeBroadcastSettings(DEFAULT_YOUTUBE_BROADCAST_SETTINGS, now)).toMatch(/title/i);
    expect(validateYouTubeBroadcastSettings({
      ...DEFAULT_YOUTUBE_BROADCAST_SETTINGS,
      title: "Sunday Service",
      scheduledStartTime: "2026-08-23T11:59:00.000Z"
    }, now)).toMatch(/future/i);
  });

  it("builds the visibility, audience, category, and playback settings sent to YouTube", () => {
    const now = Date.parse("2026-08-23T12:00:00.000Z");
    const resource = buildYouTubeBroadcastResource({
      ...DEFAULT_YOUTUBE_BROADCAST_SETTINGS,
      title: "  Sunday Service  ",
      description: "  Welcome  ",
      visibility: "public",
      categoryId: "29",
      madeForKids: true,
      latencyPreference: "ultraLow",
      enableDvr: false
    }, now);

    expect(resource.snippet).toMatchObject({
      title: "Sunday Service",
      description: "Welcome",
      categoryId: "29",
      scheduledStartTime: "2026-08-23T12:05:00.000Z"
    });
    expect(resource.status).toEqual({ privacyStatus: "public", selfDeclaredMadeForKids: true });
    expect(resource.contentDetails).toMatchObject({ latencyPreference: "ultraLow", enableDvr: false });
  });

  it("uses variable CDN detection for lower frame rates and fixed settings for 60 fps", () => {
    expect(buildYouTubeStreamResource("Service", "medium", 24).cdn).toEqual({
      ingestionType: "rtmp",
      resolution: "variable",
      frameRate: "variable"
    });
    expect(buildYouTubeStreamResource("Service", "high", 60).cdn).toEqual({
      ingestionType: "rtmp",
      resolution: "1080p",
      frameRate: "60fps"
    });
  });
});

import { describe, expect, it } from "vitest";
import { streamingProfile, streamingRecoverySettings } from "../streamingProfile";
describe("streaming load at selected resolutions", () => {
  it("reduces 720p bitrate even with High compression quality", () => {
    expect(streamingProfile("high","720p",30)).toEqual({width:1280,height:720,videoBitsPerSecond:2_889_000});
    expect(streamingProfile("high","1080p",60).videoBitsPerSecond).toBe(6_500_000);
  });
  it("retains the requested raster and scales explicit 4K/8K bitrates", () => {
    expect(streamingProfile("medium","4k").width).toBe(3840);
    expect(streamingProfile("medium","8k").videoBitsPerSecond).toBe(72_000_000);
  });
  it("progressively reduces video load while preserving audio quality and lower user frame rates", () => {
    const settings = { streamPreset: "high" as const, streamResolution: "1080p" as const, streamFps: 60 as const, streamAudioBitrate: 192 };
    const first = streamingRecoverySettings(settings, 1);
    const second = streamingRecoverySettings(settings, 2);
    expect(first).toMatchObject({ streamPreset: "low", streamResolution: "720p", streamFps: 30, streamAudioBitrate: 192 });
    expect(second).toMatchObject({ streamFps: 15, streamAudioBitrate: 192 });
    expect(streamingProfile(second.streamPreset, second.streamResolution, second.streamFps).videoBitsPerSecond)
      .toBeLessThan(streamingProfile(first.streamPreset, first.streamResolution, first.streamFps).videoBitsPerSecond);
    expect(streamingRecoverySettings({ ...settings, streamFps: 15 as const }, 1).streamFps).toBe(15);
    expect(streamingRecoverySettings(settings, 0)).toBe(settings);
    expect(settings.streamFps).toBe(60);
  });
});

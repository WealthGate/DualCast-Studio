import type { FrameRatePreset, StreamingPreset, VideoResolution } from "./types";
import { resolutionSize } from "./recording";

// Quality scales within the selected raster; choosing 720p must actually
// reduce work and bandwidth even when High quality was previously selected.
export const streamingProfile = (preset: StreamingPreset, resolution?: VideoResolution, fps = 30) => {
  const size = resolutionSize(resolution, preset === "low" ? { width: 1280, height: 720 } : { width: 1920, height: 1080 });
  const base = { low: 2_500_000, medium: 4_500_000, high: 6_500_000 }[preset];
  const pixels = size.width * size.height / (1920 * 1080);
  const rate = fps < 30 ? Math.max(0.65, fps / 30) : 1;
  return { ...size, videoBitsPerSecond: Math.round(base * pixels * rate / 1000) * 1000 };
};

// Keep the reduced profile for the remainder of this broadcast. Otherwise a
// later, isolated congestion event restores the original bitrate and repeats
// the same interruption. Frame-rate reduction also reduces capture/CPU work;
// audio bitrate and the Program/display raster remain the user's choices.
export const streamingRecoverySettings = <T extends {
  streamPreset: StreamingPreset; streamResolution?: VideoResolution; streamFps: FrameRatePreset;
}>(settings: T, level: number): T => level <= 0 ? settings : ({
  ...settings,
  streamPreset: "low",
  streamResolution: "720p",
  streamFps: Math.min(level >= 2 ? 15 : 30, settings.streamFps) as FrameRatePreset
});

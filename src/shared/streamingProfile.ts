import type { StreamingPreset, VideoResolution } from "./types";
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

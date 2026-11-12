import { QualityPreset, VideoResolution } from "./types";

export const VIDEO_RESOLUTIONS = [
  { value: "auto", label: "Automatic" },
  { value: "720p", label: "HD — 1280 × 720" },
  { value: "1080p", label: "Full HD — 1920 × 1080" },
  { value: "1440p", label: "QHD — 2560 × 1440" },
  { value: "4k", label: "4K UHD — 3840 × 2160" },
  { value: "8k", label: "8K UHD — 7680 × 4320" }
] as const;
export const normalizeVideoResolution = (value: unknown): VideoResolution => VIDEO_RESOLUTIONS.some(item => item.value === value) ? value as VideoResolution : "auto";
export const resolutionSize = (resolution: VideoResolution | undefined, fallback = { width: 1920, height: 1080 }) => {
  switch (resolution) {
    case "720p": return { width: 1280, height: 720 };
    case "1080p": return { width: 1920, height: 1080 };
    case "1440p": return { width: 2560, height: 1440 };
    case "4k": return { width: 3840, height: 2160 };
    case "8k": return { width: 7680, height: 4320 };
    default: return fallback;
  }
};
export const getOutputProfile = (preset: QualityPreset, resolution?: VideoResolution) => {
  const profile = getQualityProfile(preset);
  const size = resolutionSize(resolution, preset === "low" ? { width: 1280, height: 720 } : { width: 1920, height: 1080 });
  const pixelScale = size.width * size.height / (1920 * 1080);
  return { maxWidth: size.width, maxHeight: size.height, videoBitsPerSecond: Math.round(profile.videoBitsPerSecond * Math.max(1, pixelScale)) };
};

export const formatRecordingFilename = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  return `OpenChurch_${year}-${month}-${day}_${hours}-${minutes}-${seconds}.mp4`;
};

export const getQualityProfile = (preset: QualityPreset) => {
  switch (preset) {
    case "low":
      return { maxWidth: 1280, maxHeight: 720, videoBitsPerSecond: 2_500_000 };
    case "high":
      return { maxWidth: 2560, maxHeight: 1440, videoBitsPerSecond: 10_000_000 };
    case "medium":
    default:
      return { maxWidth: 1920, maxHeight: 1080, videoBitsPerSecond: 6_000_000 };
  }
};

export const fitToBounds = (width: number, height: number, maxWidth: number, maxHeight: number) => {
  const ratio = Math.min(maxWidth / width, maxHeight / height, 1);
  return {
    width: Math.round(width * ratio),
    height: Math.round(height * ratio)
  };
};

import { QualityPreset } from "./types";

export const formatRecordingFilename = (date: Date) => {
  const pad = (value: number) => String(value).padStart(2, "0");
  const year = date.getFullYear();
  const month = pad(date.getMonth() + 1);
  const day = pad(date.getDate());
  const hours = pad(date.getHours());
  const minutes = pad(date.getMinutes());
  const seconds = pad(date.getSeconds());

  return `DualCast_${year}-${month}-${day}_${hours}-${minutes}-${seconds}.mp4`;
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

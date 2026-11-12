import { describe, expect, it } from "vitest";
import { formatRecordingFilename, fitToBounds } from "../recording";

describe("recording utilities", () => {
  it("formats filenames with date and time", () => {
    const date = new Date("2024-07-03T15:04:05Z");
    const result = formatRecordingFilename(date);
    expect(result).toContain("OpenChurch_");
    expect(result).toContain(".mp4");
  });

  it("fits within bounds without upscaling", () => {
    const result = fitToBounds(3840, 2160, 1920, 1080);
    expect(result.width).toBe(1920);
    expect(result.height).toBe(1080);
  });
});

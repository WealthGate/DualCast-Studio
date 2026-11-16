import { describe, expect, it } from "vitest";
import { recommendAutoConfiguration } from "../autoConfiguration";

describe("auto configuration", () => {
  it("uses a lightweight low-bandwidth configuration", () => {
    const result = recommendAutoConfiguration({ useCase: "stream-first", uploadMbps: 2.5, motion: "normal", encoders: ["x264"] });
    expect(result).toMatchObject({ streamPreset: "low", streamFps: 15, streamAudioBitrate: 128, streamEncoder: "x264" });
  });

  it("prefers a tested NVIDIA encoder and 60 fps only with enough headroom", () => {
    const result = recommendAutoConfiguration({ useCase: "balanced", uploadMbps: 20, motion: "high", encoders: ["x264", "nvenc"] });
    expect(result).toMatchObject({ streamPreset: "high", streamFps: 60, streamEncoder: "nvenc" });
  });
});

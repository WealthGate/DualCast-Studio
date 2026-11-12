import {
  QualityPreset,
  StreamingAudioBitrate,
  StreamingEncoder,
  StreamingFps,
  StreamingPreset
} from "../../shared/types";

export type AutoConfigurationInput = {
  useCase: "stream-first" | "record-first" | "balanced";
  uploadMbps: number;
  motion: "normal" | "high";
  encoders: StreamingEncoder[];
};

export type AutoConfigurationRecommendation = {
  streamPreset: StreamingPreset;
  streamFps: StreamingFps;
  streamAudioBitrate: StreamingAudioBitrate;
  streamEncoder: StreamingEncoder;
  qualityPreset: QualityPreset;
  explanation: string;
};

const encoderPriority: StreamingEncoder[] = ["nvenc", "qsv", "amf", "mediafoundation", "videotoolbox", "vaapi", "v4l2m2m", "x264"];

export const recommendAutoConfiguration = (input: AutoConfigurationInput): AutoConfigurationRecommendation => {
  const uploadMbps = Number.isFinite(input.uploadMbps) ? Math.max(0.5, input.uploadMbps) : 5;
  const streamPreset: StreamingPreset = uploadMbps < 4 ? "low" : uploadMbps < 9 ? "medium" : "high";
  const streamFps: StreamingFps = uploadMbps < 2.8
    ? 15
    : input.motion === "high" && uploadMbps >= 12
      ? 60
      : 30;
  const streamEncoder = encoderPriority.find((encoder) => input.encoders.includes(encoder)) ?? "x264";
  const qualityPreset: QualityPreset = input.useCase === "record-first"
    ? "high"
    : streamPreset === "low" ? "medium" : streamPreset;
  const streamAudioBitrate: StreamingAudioBitrate = uploadMbps >= 5 ? 192 : 128;
  const hardware = streamEncoder !== "x264";
  return {
    streamPreset,
    streamFps,
    streamAudioBitrate,
    streamEncoder,
    qualityPreset,
    explanation: `${streamPreset === "low" ? "720p" : "1080p"} at ${streamFps} fps leaves upload headroom. ${hardware ? "A tested hardware encoder reduces CPU load." : "Software x264 is the compatible fallback on this computer."}`
  };
};

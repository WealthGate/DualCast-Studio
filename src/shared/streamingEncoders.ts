import { StreamingEncoder } from "./types";

export type StreamingEncoderBackend = Exclude<StreamingEncoder, "auto">;

export const STREAMING_ENCODER_OPTIONS: Array<{
  id: StreamingEncoderBackend;
  label: string;
  ffmpegName: string;
  hardware: boolean;
}> = [
  { id: "nvenc", label: "NVIDIA NVENC", ffmpegName: "h264_nvenc", hardware: true },
  { id: "qsv", label: "Intel Quick Sync", ffmpegName: "h264_qsv", hardware: true },
  { id: "amf", label: "AMD AMF", ffmpegName: "h264_amf", hardware: true },
  { id: "mediafoundation", label: "Windows Media Foundation", ffmpegName: "h264_mf", hardware: true },
  { id: "videotoolbox", label: "Apple VideoToolbox", ffmpegName: "h264_videotoolbox", hardware: true },
  { id: "vaapi", label: "Linux VA-API", ffmpegName: "h264_vaapi", hardware: true },
  { id: "v4l2m2m", label: "Linux V4L2 M2M", ffmpegName: "h264_v4l2m2m", hardware: true },
  { id: "x264", label: "Software x264 (CPU)", ffmpegName: "libx264", hardware: false }
];

export const getStreamingEncoderOption = (encoder: StreamingEncoder) =>
  STREAMING_ENCODER_OPTIONS.find((option) => option.id === encoder);

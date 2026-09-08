import { StreamingEncoder } from "../../src/shared/types";
import {
  getStreamingEncoderOption,
  STREAMING_ENCODER_OPTIONS
} from "../../src/shared/streamingEncoders";

export const probedStreamingEncoders = STREAMING_ENCODER_OPTIONS
  .filter((option) => option.hardware)
  .map((option) => option.id);

export const mapStreamingEncoder = (encoder: StreamingEncoder) =>
  getStreamingEncoderOption(encoder)?.ffmpegName ?? "libx264";

export const buildEncoderProbeArgs = (
  encoder: StreamingEncoder,
  options?: { vaapiDevice?: string | null }
) => {
  const args = ["-hide_banner", "-loglevel", "error"];
  if (encoder === "vaapi" && options?.vaapiDevice) {
    args.push("-vaapi_device", options.vaapiDevice);
  }
  args.push("-f", "lavfi", "-i", "color=c=black:s=64x64:r=1");
  if (encoder === "vaapi") {
    args.push("-vf", "format=nv12,hwupload");
  } else if (encoder === "mediafoundation") {
    args.push("-vf", "format=nv12");
  }
  args.push("-frames:v", "1", "-an", "-c:v", mapStreamingEncoder(encoder));
  if (encoder === "mediafoundation") {
    args.push("-hw_encoding", "1", "-scenario", "live_streaming", "-rate_control", "cbr");
  }
  args.push("-f", "null", "-");
  return args;
};

export const resolveStreamingEncoder = (
  requested: StreamingEncoder,
  availableEncoders: ReadonlySet<StreamingEncoder>
) => {
  if (requested !== "auto" && availableEncoders.has(requested)) {
    return requested;
  }
  return STREAMING_ENCODER_OPTIONS.find((option) => availableEncoders.has(option.id))?.id ?? "x264";
};

export const isHardwareEncoderStartupFailure = (encoder: StreamingEncoder, line: string) => {
  if (!getStreamingEncoderOption(encoder)?.hardware) {
    return false;
  }
  return /driver does not support the required .*api|cannot load (?:nv|cuda|amf)|no capable devices|no device available|no va display|device (?:creation|setup) failed|failed to (?:initiali[sz]e|create|open) .*device|error initializing an internal mfx session|error (?:initializing|while opening) encoder|dll .* failed to open|could not create compression session|device or resource busy|function not implemented/i.test(
    line
  );
};

export const hasEncodedVideoFrame = (line: string) => {
  const match = line.match(/frame=\s*([0-9]+)/);
  return Boolean(match && Number(match[1]) > 0);
};

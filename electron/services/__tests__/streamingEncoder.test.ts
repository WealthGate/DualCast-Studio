import { describe, expect, it } from "vitest";
import {
  buildEncoderProbeArgs,
  hasEncodedVideoFrame,
  isHardwareEncoderStartupFailure,
  mapStreamingEncoder,
  resolveStreamingEncoder
} from "../streamingEncoder";
import { StreamingEncoder } from "../../../src/shared/types";

describe("streaming encoder selection", () => {
  it("falls back to x264 when a requested or automatic hardware encoder is unavailable", () => {
    const softwareOnly = new Set<StreamingEncoder>(["x264"]);

    expect(resolveStreamingEncoder("auto", softwareOnly)).toBe("x264");
    expect(resolveStreamingEncoder("nvenc", softwareOnly)).toBe("x264");
  });

  it("uses an available hardware encoder after capability probing succeeds", () => {
    const available = new Set<StreamingEncoder>(["x264", "mediafoundation", "qsv"]);

    expect(resolveStreamingEncoder("auto", available)).toBe("qsv");
    expect(resolveStreamingEncoder("qsv", available)).toBe("qsv");
  });

  it("maps every supported desktop backend to its FFmpeg H.264 encoder", () => {
    expect(mapStreamingEncoder("nvenc")).toBe("h264_nvenc");
    expect(mapStreamingEncoder("qsv")).toBe("h264_qsv");
    expect(mapStreamingEncoder("amf")).toBe("h264_amf");
    expect(mapStreamingEncoder("mediafoundation")).toBe("h264_mf");
    expect(mapStreamingEncoder("videotoolbox")).toBe("h264_videotoolbox");
    expect(mapStreamingEncoder("vaapi")).toBe("h264_vaapi");
    expect(mapStreamingEncoder("v4l2m2m")).toBe("h264_v4l2m2m");
    expect(mapStreamingEncoder("x264")).toBe("libx264");
  });

  it("builds a real one-frame encoder probe", () => {
    const args = buildEncoderProbeArgs("nvenc");

    expect(args).toContain("lavfi");
    expect(args).toContain("h264_nvenc");
    expect(args).toContain("1");
  });

  it("uploads software frames to a discovered Linux VA-API device during probing", () => {
    const args = buildEncoderProbeArgs("vaapi", { vaapiDevice: "/dev/dri/renderD128" });

    expect(args).toContain("-vaapi_device");
    expect(args).toContain("/dev/dri/renderD128");
    expect(args).toContain("format=nv12,hwupload");
    expect(args).toContain("h264_vaapi");
  });

  it("tests the actual hardware path for Windows Media Foundation", () => {
    const args = buildEncoderProbeArgs("mediafoundation");

    expect(args).toContain("format=nv12");
    expect(args).toContain("-hw_encoding");
    expect(args).toContain("live_streaming");
    expect(args).toContain("cbr");
  });

  it("recognizes hardware initialization failures without misclassifying x264", () => {
    const error = "Driver does not support the required nvenc API version. Required: 12.1 Found: 11.0";

    expect(isHardwareEncoderStartupFailure("nvenc", error)).toBe(true);
    expect(isHardwareEncoderStartupFailure("qsv", "Error initializing an internal MFX session")).toBe(true);
    expect(isHardwareEncoderStartupFailure("amf", "DLL amfrt64.dll failed to open")).toBe(true);
    expect(isHardwareEncoderStartupFailure("videotoolbox", "Could not create compression session")).toBe(true);
    expect(isHardwareEncoderStartupFailure("vaapi", "No VA display found for device")).toBe(true);
    expect(isHardwareEncoderStartupFailure("x264", error)).toBe(false);
    expect(isHardwareEncoderStartupFailure("nvenc", "Server returned 403 Forbidden")).toBe(false);
  });

  it("does not report frame zero as a live stream", () => {
    expect(hasEncodedVideoFrame("frame=    0 fps=0.0 bitrate=0.0kbits/s")).toBe(false);
    expect(hasEncodedVideoFrame("frame=    1 fps=1.0 bitrate=4500.0kbits/s")).toBe(true);
  });
});

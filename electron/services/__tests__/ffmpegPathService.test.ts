import { describe, expect, it, vi } from "vitest";
import { resolveFfmpegExecutablePath } from "../ffmpegPathService";

describe("resolveFfmpegExecutablePath", () => {
  it("uses the installed app.asar.unpacked binary on Windows", () => {
    const bundled = "C:\\Program Files\\OpenChurch\\resources\\app.asar\\node_modules\\ffmpeg-static\\ffmpeg.exe";
    const unpacked = "C:\\Program Files\\OpenChurch\\resources\\app.asar.unpacked\\node_modules\\ffmpeg-static\\ffmpeg.exe";
    const existsSync = vi.fn((candidate: string) => candidate === unpacked);

    expect(resolveFfmpegExecutablePath(bundled, existsSync)).toBe(unpacked);
    expect(existsSync).toHaveBeenCalledWith(unpacked);
    expect(existsSync).not.toHaveBeenCalledWith(bundled);
  });

  it("uses the installed app.asar.unpacked binary on macOS and Linux", () => {
    const bundled = "/opt/OpenChurch/resources/app.asar/node_modules/ffmpeg-static/ffmpeg";
    const unpacked = "/opt/OpenChurch/resources/app.asar.unpacked/node_modules/ffmpeg-static/ffmpeg";

    expect(resolveFfmpegExecutablePath(bundled, (candidate) => candidate === unpacked)).toBe(unpacked);
  });

  it("uses the normal module binary during development", () => {
    const developmentPath = "C:\\workspace\\node_modules\\ffmpeg-static\\ffmpeg.exe";

    expect(resolveFfmpegExecutablePath(developmentPath, () => true)).toBe(developmentPath);
  });

  it("never returns an executable path trapped inside app.asar", () => {
    const bundled = "C:\\OpenChurch\\resources\\app.asar\\node_modules\\ffmpeg-static\\ffmpeg.exe";
    const existsSync = vi.fn((candidate: string) => candidate === bundled);

    expect(resolveFfmpegExecutablePath(bundled, existsSync)).toBeNull();
    expect(existsSync).not.toHaveBeenCalledWith(bundled);
  });

  it("returns null when the dependency did not provide a supported binary", () => {
    expect(resolveFfmpegExecutablePath(null)).toBeNull();
  });
});

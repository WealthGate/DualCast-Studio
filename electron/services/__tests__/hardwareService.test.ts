import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({
  disableHardwareAcceleration: vi.fn(), appendSwitch: vi.fn(), getGPUInfo: vi.fn(),
  isHardwareAccelerationEnabled: vi.fn(), getGPUFeatureStatus: vi.fn(),
  availableCaptureEncoders: vi.fn(), getWindowsCaptureExecutable: vi.fn(), getStreamingCapabilities: vi.fn()
}));
vi.mock("electron", () => ({ app: { ...mocks, commandLine: { appendSwitch: mocks.appendSwitch } } }));
vi.mock("../h264Capture", () => ({ availableCaptureEncoders: mocks.availableCaptureEncoders }));
vi.mock("../windowsCapturePathService", () => ({ getWindowsCaptureExecutable: mocks.getWindowsCaptureExecutable }));
vi.mock("../streamingService", () => ({ getStreamingCapabilities: mocks.getStreamingCapabilities }));
import { configureGraphics, getHardwareCapabilities } from "../hardwareService";

describe("graphics selection and capability detection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getGPUInfo.mockResolvedValue({ gpuDevice: [{ vendorId: 4318, deviceString: "NVIDIA GeForce", active: true }, { vendorId: 32902 }] });
    mocks.isHardwareAccelerationEnabled.mockReturnValue(true);
    mocks.getGPUFeatureStatus.mockReturnValue({ gpu_compositing: "enabled" });
    mocks.getWindowsCaptureExecutable.mockReturnValue("capture.exe");
    mocks.availableCaptureEncoders.mockResolvedValue(["h264_qsv", "libx264"]);
    mocks.getStreamingCapabilities.mockReturnValue({ encoders: ["x264", "qsv"] });
    configureGraphics("auto");
  });
  afterEach(() => vi.unstubAllGlobals());
  it("applies GPU preferences through supported startup switches", () => {
    configureGraphics("high-performance"); configureGraphics("power-saving");
    expect(mocks.appendSwitch.mock.calls).toEqual([["force_high_performance_gpu"], ["force_low_power_gpu"]]);
    configureGraphics("software");
    expect(mocks.disableHardwareAcceleration).toHaveBeenCalledOnce();
  });
  it("reports devices separately from encoders proven usable with the current driver", async () => {
    vi.stubGlobal("process", { ...process, platform: "win32" });
    const result = await getHardwareCapabilities();
    expect(result.devices).toEqual([{ name: "NVIDIA GeForce", active: true }, { name: "Intel", active: false }]);
    expect(result.captureEncoders).toEqual(["qsv", "x264"]);
    expect(result.streamEncoders).not.toContain("nvenc");
    expect(result.accelerated).toBe(true);
  });
  it.each(["darwin", "linux"])("reports %s native streaming backends without probing a Windows capture runtime", async platform => {
    vi.stubGlobal("process", { ...process, platform });
    mocks.getStreamingCapabilities.mockReturnValue({ encoders: ["x264", platform === "darwin" ? "videotoolbox" : "vaapi"] });
    const result = await getHardwareCapabilities();
    expect(result.platform).toBe(platform);
    expect(result.streamEncoders).toHaveLength(2);
    expect(mocks.availableCaptureEncoders).not.toHaveBeenCalled();
  });
  it("keeps encoder choices available when the OS cannot provide GPU names", async () => {
    mocks.getGPUInfo.mockRejectedValue(new Error("unavailable"));
    mocks.getGPUFeatureStatus.mockReturnValue({ gpu_compositing: "disabled_software" });
    const result = await getHardwareCapabilities();
    expect(result.devices).toEqual([]);
    expect(result.accelerated).toBe(false);
    expect(result.streamEncoders).toEqual(["x264", "qsv"]);
  });
});

import { app } from "electron";
import type { GraphicsMode, HardwareCapabilities, StreamingEncoder } from "../../src/shared/types";
import { availableCaptureEncoders } from "./h264Capture";
import { getWindowsCaptureExecutable } from "./windowsCapturePathService";
import { getStreamingCapabilities } from "./streamingService";

let activeMode: GraphicsMode = "auto";
export const configureGraphics = (mode: GraphicsMode = "auto") => {
  activeMode = mode;
  if (mode === "software") app.disableHardwareAcceleration();
  if (mode === "high-performance") app.commandLine.appendSwitch("force_high_performance_gpu");
  if (mode === "power-saving") app.commandLine.appendSwitch("force_low_power_gpu");
};
export const getHardwareCapabilities = async (): Promise<HardwareCapabilities> => {
  const info = await app.getGPUInfo("complete").catch(() => ({})) as { gpuDevice?: { active?: boolean; vendorId?: number; vendorString?: string; deviceString?: string }[] };
  const names: Record<number, string> = { 4318: "NVIDIA", 32902: "Intel", 4098: "AMD", 4203: "Apple" };
  const executable = process.platform === "win32" ? getWindowsCaptureExecutable() : null;
  const captureEncoders: StreamingEncoder[] = executable ? (await availableCaptureEncoders(executable)).map(encoder => encoder === "libx264" ? "x264" : encoder.slice(5) as StreamingEncoder) : [];
  return {
    platform: process.platform,
    graphicsMode: activeMode,
    accelerated: app.isHardwareAccelerationEnabled() && String(app.getGPUFeatureStatus().gpu_compositing).startsWith("enabled"),
    devices: (info.gpuDevice ?? []).map(device => ({ name: device.deviceString || device.vendorString || names[device.vendorId ?? 0] || "Graphics device", active: device.active === true })),
    streamEncoders: getStreamingCapabilities().encoders,
    captureEncoders
  };
};

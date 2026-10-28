import { describe, expect, it, vi } from "vitest";
import {
  createProgramAudioMonitor,
  resolveProgramMonitorGain,
  updateProgramAudioMonitor
} from "../audioMonitoring";

describe("Program audio monitoring", () => {
  it("is silent by default and clamps an enabled monitor to a safe local range", () => {
    expect(resolveProgramMonitorGain(false, 1)).toBe(0);
    expect(resolveProgramMonitorGain(true, -1)).toBe(0);
    expect(resolveProgramMonitorGain(true, 0.65)).toBe(0.65);
    expect(resolveProgramMonitorGain(true, 2)).toBe(1);
  });

  it("creates a separate local-output branch after Program Master", () => {
    const monitorGain = { gain: { value: -1 }, connect: vi.fn() };
    const destination = {};
    const audioContext = { createGain: vi.fn(() => monitorGain), destination };
    const masterGain = { connect: vi.fn() };

    const created = createProgramAudioMonitor(
      audioContext as unknown as AudioContext,
      masterGain as unknown as GainNode,
      false,
      0.8
    );

    expect(created).toBe(monitorGain);
    expect(monitorGain.gain.value).toBe(0);
    expect(masterGain.connect).toHaveBeenCalledWith(monitorGain);
    expect(monitorGain.connect).toHaveBeenCalledWith(destination);

    updateProgramAudioMonitor(monitorGain as unknown as GainNode, true, 0.45);
    expect(monitorGain.gain.value).toBe(0.45);
  });
});

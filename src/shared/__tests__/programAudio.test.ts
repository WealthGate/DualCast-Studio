import { describe, expect, it } from "vitest";
import { defaultProgramEqualizer, normalizeAudioInputLines, normalizeAudioInputPreset, normalizeProgramEqualizer, unprocessedAudioConstraints } from "../programAudio";

describe("Program audio settings", () => {
  it("keeps old profiles transparent and rejects invalid gain settings", () => {
    expect(normalizeProgramEqualizer(undefined)).toEqual(defaultProgramEqualizer);
    expect(normalizeProgramEqualizer({ enabled: "true", lowGainDb: NaN, midGainDb: Infinity, highGainDb: "6" })).toEqual(defaultProgramEqualizer);
    expect(normalizeProgramEqualizer({ enabled: true, lowGainDb: 50, midGainDb: -50, highGainDb: 4.5 }))
      .toEqual({ enabled: true, lowGainDb: 12, midGainDb: -12, highGainDb: 4.5 });
  });

  it("preserves source dynamics and uses optional stereo/rate hints for mono devices", () => {
    expect(unprocessedAudioConstraints()).toEqual({
      echoCancellation: false, noiseSuppression: false, autoGainControl: false,
      sampleRate: { ideal: 48000 }, channelCount: { ideal: 2 }
    });
    expect(unprocessedAudioConstraints("studio-interface").deviceId).toEqual({ exact: "studio-interface" });
  });

  it("normalizes independent input settings and keeps legacy profiles on Clean", () => {
    expect(normalizeAudioInputLines(undefined)).toEqual([]);
    expect(normalizeAudioInputPreset("constructor")).toBe("clean");
    expect(normalizeAudioInputLines([
      { id: "vocal", name: "  Lead mic  ", deviceId: "interface", channel: 2, gain: 3, muted: true, preset: "vocal" },
      { id: "vocal", name: "duplicate" },
      { id: "keys", name: "", channel: 9, gain: NaN, preset: "unknown" },
      ...Array.from({ length: 9 }, (_, i) => ({ id: `line-${i}`, preset: "choir" }))
    ])).toMatchObject([
      { id: "vocal", name: "Lead mic", channel: 2, deviceId: "interface", gain: 2, muted: true, preset: "vocal" },
      { id: "keys", name: "Input 3", deviceId: null, channel: null, gain: 1, muted: false, preset: "clean" },
      ...Array.from({ length: 5 }, (_, i) => ({ id: `line-${i}`, preset: "choir" }))
    ]);
  });
});

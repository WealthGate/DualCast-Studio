import { describe, expect, it } from "vitest";
import { defaultProgramEqualizer, normalizeProgramEqualizer, unprocessedAudioConstraints } from "../programAudio";

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
});

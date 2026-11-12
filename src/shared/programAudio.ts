export type ProgramEqualizerSettings = {
  enabled: boolean;
  lowGainDb: number;
  midGainDb: number;
  highGainDb: number;
};

export const defaultProgramEqualizer: ProgramEqualizerSettings = {
  enabled: false,
  lowGainDb: 0,
  midGainDb: 0,
  highGainDb: 0
};

export const normalizeProgramEqualizer = (value: unknown): ProgramEqualizerSettings => {
  const raw = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const gain = (key: string) => typeof raw[key] === "number" && Number.isFinite(raw[key])
    ? Math.min(12, Math.max(-12, raw[key] as number)) : 0;
  return { enabled: raw.enabled === true, lowGainDb: gain("lowGainDb"), midGainDb: gain("midGainDb"), highGainDb: gain("highGainDb") };
};

// Music and a full service mix must not inherit Chromium's speech processing.
// Ideal channel/rate hints preserve devices that expose only mono or 44.1 kHz.
export const unprocessedAudioConstraints = (deviceId?: string | null): MediaTrackConstraints => ({
  ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: { ideal: 2 },
  sampleRate: { ideal: 48000 }
});

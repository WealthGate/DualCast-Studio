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

export const audioInputPresets = {
  clean: { label: "Clean", description: "Original input sound" },
  radio: { label: "Radio Gold", description: "Warm, clear speech with even levels" },
  vocal: { label: "Lead Vocal", description: "Clear singing with gentle compression" },
  choir: { label: "Choir", description: "Stereo vocal doubling and space" }
} as const;

export type AudioInputPreset = keyof typeof audioInputPresets;

export type AudioInputLine = {
  id: string;
  name: string;
  deviceId: string | null;
  channel: number | null;
  gain: number;
  muted: boolean;
  preset: AudioInputPreset;
};

export const maxAudioInputChannels = 8;
export const maxAdditionalAudioInputs = 7;
export const audioInputMeterId = (id: string) => `audio-input:${id}`;

export const normalizeAudioInputPreset = (value: unknown): AudioInputPreset =>
  typeof value === "string" && Object.prototype.hasOwnProperty.call(audioInputPresets, value) ? value as AudioInputPreset : "clean";

export const normalizeAudioInputChannel = (value: unknown): number | null =>
  typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= maxAudioInputChannels ? value : null;

export const normalizeAudioInputLines = (value: unknown): AudioInputLine[] => {
  if (!Array.isArray(value)) return [];
  const lines = new Map<string, AudioInputLine>();
  for (const raw of value) {
    if (lines.size >= maxAdditionalAudioInputs) break;
    if (!raw || typeof raw.id !== "string" || !/^[\w-]{1,64}$/.test(raw.id) || lines.has(raw.id)) continue;
    lines.set(raw.id, {
      id: raw.id,
      name: (typeof raw.name === "string" ? raw.name.slice(0, 64).trim() : "") || `Input ${lines.size + 2}`,
      deviceId: typeof raw.deviceId === "string" && raw.deviceId ? raw.deviceId : null,
      channel: normalizeAudioInputChannel(raw.channel),
      gain: typeof raw.gain === "number" && Number.isFinite(raw.gain) ? Math.min(2, Math.max(0, raw.gain)) : 1,
      muted: raw.muted === true,
      preset: normalizeAudioInputPreset(raw.preset)
    });
  }
  return [...lines.values()];
};

// Music and a full service mix must not inherit Chromium's speech processing.
// Ideal channel/rate hints preserve devices that expose only mono or 44.1 kHz.
export const unprocessedAudioConstraints = (deviceId?: string | null, channelCount = 2): MediaTrackConstraints => ({
  ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
  echoCancellation: false,
  noiseSuppression: false,
  autoGainControl: false,
  channelCount: { ideal: channelCount },
  sampleRate: { ideal: 48000 }
});

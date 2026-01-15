export type AudioMode = "system" | "microphone" | "both" | "none";
export type QualityPreset = "low" | "medium" | "high";
export type FrameRatePreset = 30 | 60;

export type CaptureSourceType = "screen" | "window";

export type DisplaySource = {
  id: string;
  name: string;
  sourceType: CaptureSourceType;
  displayId: string | null;
  size: {
    width: number;
    height: number;
  };
  thumbnailUrl: string;
  appIconUrl?: string | null;
};

export type Settings = {
  saveDirectory: string;
  qualityPreset: QualityPreset;
  frameRate: FrameRatePreset;
  audioMode: AudioMode;
  lastDisplayId: string | null;
};

export type SettingsUpdate = Partial<Settings>;

export type SaveRecordingPayload = {
  data: Uint8Array;
};

export type SaveRecordingResult = {
  filePath: string;
  fileName: string;
  usedFallback: boolean;
};

export type HotkeyAction = "toggle-record" | "take" | "cut-black";

export type StreamingStatus = "idle" | "connecting" | "live" | "error";

export type StreamStartPayload = {
  rtmpUrl: string;
  streamKey: string;
  hasAudio: boolean;
};

export type StreamStartResult = {
  ok: boolean;
  message?: string;
};

export type StreamStopResult = {
  ok: boolean;
  message?: string;
};

export type StreamStatusPayload = {
  status: StreamingStatus;
  message?: string | null;
  startedAt?: number | null;
};

export type ProgramState = {
  programSourceId: string | null;
  isCutToBlack: boolean;
  isFrozen: boolean;
  qualityPreset: QualityPreset;
};

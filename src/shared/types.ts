export type AudioMode = "system" | "microphone" | "both" | "none";
export type QualityPreset = "low" | "medium" | "high";
export type FrameRatePreset = 30 | 60;
export type StreamingPreset = "low" | "medium" | "high";
export type StreamingFps = 30 | 60;
export type StreamingAudioBitrate = 128 | 192;
export type StreamingEncoder = "auto" | "x264" | "nvenc" | "qsv" | "amf";

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
  streamRtmpUrl: string;
  streamPreset: StreamingPreset;
  streamFps: StreamingFps;
  streamAudioBitrate: StreamingAudioBitrate;
  streamEncoder: StreamingEncoder;
  rememberStreamKey: boolean;
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

export type StreamingStatus = "idle" | "connecting" | "live" | "reconnecting" | "error";

export type StreamStartPayload = {
  rtmpUrl: string;
  streamKey: string;
  hasAudio: boolean;
  preset: StreamingPreset;
  fps: StreamingFps;
  audioBitrate: StreamingAudioBitrate;
  encoder: StreamingEncoder;
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
  logPath?: string | null;
  stats?: {
    fps?: number | null;
    bitrateKbps?: number | null;
    time?: string | null;
    droppedFrames?: number | null;
  } | null;
  reconnectAttempt?: number | null;
  reconnectMax?: number | null;
  lastError?: string | null;
};

export type ProgramState = {
  programSourceId: string | null;
  isCutToBlack: boolean;
  isFrozen: boolean;
  qualityPreset: QualityPreset;
};

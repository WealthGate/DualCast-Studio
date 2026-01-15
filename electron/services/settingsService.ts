import Store from "electron-store";
import path from "path";
import { app } from "electron";
import {
  AudioMode,
  FrameRatePreset,
  QualityPreset,
  Settings,
  SettingsUpdate,
  StreamingAudioBitrate,
  StreamingEncoder,
  StreamingFps,
  StreamingPreset
} from "../../src/shared/types";

let store: Store<Settings> | null = null;

const allowedQuality: QualityPreset[] = ["low", "medium", "high"];
const allowedFrameRates: FrameRatePreset[] = [30, 60];
const allowedAudio: AudioMode[] = ["system", "microphone", "both", "none"];
const allowedStreamingPresets: StreamingPreset[] = ["low", "medium", "high"];
const allowedStreamingFps: StreamingFps[] = [30, 60];
const allowedStreamingAudio: StreamingAudioBitrate[] = [128, 192];
const allowedStreamingEncoders: StreamingEncoder[] = ["auto", "x264", "nvenc", "qsv", "amf"];

export const getDefaultSaveDirectory = () => path.join(app.getPath("videos"), "DualCast Studio");

const createStore = () => {
  return new Store<Settings>({
    defaults: {
      saveDirectory: getDefaultSaveDirectory(),
      qualityPreset: "medium",
      frameRate: 30,
      audioMode: "system",
      lastDisplayId: null,
      streamRtmpUrl: "",
      streamPreset: "medium",
      streamFps: 30,
      streamAudioBitrate: 128,
      streamEncoder: "auto",
      rememberStreamKey: false
    },
    schema: {
      saveDirectory: { type: "string" },
      qualityPreset: { type: "string" },
      frameRate: { type: "number" },
      audioMode: { type: "string" },
      lastDisplayId: { type: ["string", "null"] },
      streamRtmpUrl: { type: "string" },
      streamPreset: { type: "string" },
      streamFps: { type: "number" },
      streamAudioBitrate: { type: "number" },
      streamEncoder: { type: "string" },
      rememberStreamKey: { type: "boolean" }
    }
  });
};

const getStore = () => {
  if (!store) {
    store = createStore();
  }
  return store;
};

export const getSettings = (): Settings => {
  return getStore().store;
};

export const sanitizeSettingsUpdate = (update: SettingsUpdate): SettingsUpdate => {
  const sanitized: SettingsUpdate = {};

  if (typeof update.saveDirectory === "string" && update.saveDirectory.trim().length > 0) {
    sanitized.saveDirectory = update.saveDirectory;
  }

  if (allowedQuality.includes(update.qualityPreset as QualityPreset)) {
    sanitized.qualityPreset = update.qualityPreset;
  }

  if (allowedFrameRates.includes(update.frameRate as FrameRatePreset)) {
    sanitized.frameRate = update.frameRate;
  }

  if (allowedAudio.includes(update.audioMode as AudioMode)) {
    sanitized.audioMode = update.audioMode;
  }

  if (typeof update.lastDisplayId === "string" || update.lastDisplayId === null) {
    sanitized.lastDisplayId = update.lastDisplayId;
  }

  if (typeof update.streamRtmpUrl === "string") {
    sanitized.streamRtmpUrl = update.streamRtmpUrl;
  }

  if (allowedStreamingPresets.includes(update.streamPreset as StreamingPreset)) {
    sanitized.streamPreset = update.streamPreset;
  }

  if (allowedStreamingFps.includes(update.streamFps as StreamingFps)) {
    sanitized.streamFps = update.streamFps;
  }

  if (allowedStreamingAudio.includes(update.streamAudioBitrate as StreamingAudioBitrate)) {
    sanitized.streamAudioBitrate = update.streamAudioBitrate;
  }

  if (allowedStreamingEncoders.includes(update.streamEncoder as StreamingEncoder)) {
    sanitized.streamEncoder = update.streamEncoder;
  }

  if (typeof update.rememberStreamKey === "boolean") {
    sanitized.rememberStreamKey = update.rememberStreamKey;
  }

  return sanitized;
};

export const updateSettings = (update: SettingsUpdate): Settings => {
  const sanitized = sanitizeSettingsUpdate(update);
  const storeInstance = getStore();
  storeInstance.set(sanitized);
  return storeInstance.store;
};

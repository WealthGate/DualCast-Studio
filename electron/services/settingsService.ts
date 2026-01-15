import Store from "electron-store";
import path from "path";
import { app } from "electron";
import { AudioMode, FrameRatePreset, QualityPreset, Settings, SettingsUpdate } from "../../src/shared/types";

let store: Store<Settings> | null = null;

const allowedQuality: QualityPreset[] = ["low", "medium", "high"];
const allowedFrameRates: FrameRatePreset[] = [30, 60];
const allowedAudio: AudioMode[] = ["system", "microphone", "both", "none"];

export const getDefaultSaveDirectory = () => path.join(app.getPath("videos"), "DualCast Studio");

const createStore = () => {
  return new Store<Settings>({
    defaults: {
      saveDirectory: getDefaultSaveDirectory(),
      qualityPreset: "medium",
      frameRate: 30,
      audioMode: "system",
      lastDisplayId: null
    },
    schema: {
      saveDirectory: { type: "string" },
      qualityPreset: { type: "string" },
      frameRate: { type: "number" },
      audioMode: { type: "string" },
      lastDisplayId: { type: ["string", "null"] }
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

  return sanitized;
};

export const updateSettings = (update: SettingsUpdate): Settings => {
  const sanitized = sanitizeSettingsUpdate(update);
  const storeInstance = getStore();
  storeInstance.set(sanitized);
  return storeInstance.store;
};

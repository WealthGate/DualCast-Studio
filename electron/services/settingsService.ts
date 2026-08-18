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
  StreamingPreset,
  StudioState,
  ThemePreference
} from "../../src/shared/types";

let store: Store<Settings> | null = null;

const allowedQuality: QualityPreset[] = ["low", "medium", "high"];
const allowedFrameRates: FrameRatePreset[] = [30, 60];
const allowedAudio: AudioMode[] = ["system", "microphone", "both", "none"];
const allowedStreamingPresets: StreamingPreset[] = ["low", "medium", "high"];
const allowedStreamingFps: StreamingFps[] = [30, 60];
const allowedStreamingAudio: StreamingAudioBitrate[] = [128, 192];
const allowedStreamingEncoders: StreamingEncoder[] = ["auto", "x264", "nvenc", "qsv", "amf"];
const allowedOperatorRoles = ["director", "graphics", "audio", "stream"];
const allowedThemes: ThemePreference[] = ["system", "dark", "light", "high-contrast", "midnight", "warm"];

export const getDefaultSaveDirectory = () => path.join(app.getPath("videos"), "OpenChurch Broadcast Studio");

const defaultStudioState: StudioState = {
  scenes: [{ id: "scene-1", name: "Scene 1", sourceIds: [] }],
  sources: {},
  groups: [],
  previewSceneId: "scene-1",
  programSceneId: "scene-1"
};

const defaultLowerThird = {
  enabled: false,
  displayId: null,
  heightPercent: 28,
  position: "bottom" as const,
  backgroundColor: "#101722",
  textColor: "#ffffff",
  fontSize: 48,
  fontFamily: "Segoe UI",
  bold: true,
  italic: false,
  underline: false,
  textAlign: "center" as const,
  imageUrl: "",
  imagePosition: "left" as const,
  entranceAnimation: "fade" as const,
  exitAnimation: "fade" as const,
  animationDurationMs: 450,
  showOnProgram: true,
  maxLines: 0,
  slides: [],
  activeSlideId: null
};

const defaultNetworkOutput = {
  enabled: false,
  port: 8787,
  operatorPin: "2468"
};

const defaultIntegrations = {
  songProvider: "local" as const,
  songLibraryPath: "",
  songApiUrl: "",
  scriptureProvider: "api-bible" as const,
  scriptureApiUrl: "https://api.scripture.api.bible/v1",
  scriptureApiKeyEnv: "OPENCHURCH_SCRIPTURE_API_KEY",
  scriptureBibleId: "",
  aiProvider: "disabled" as const,
  aiBaseUrl: "https://api.openai.com/v1",
  aiModel: "gpt-5.6-sol",
  aiApiKeyEnv: "OPENAI_API_KEY",
  aiLiveCaptions: false,
  aiSermonSummary: false,
  aiHighlightDetection: false
};

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
      rememberStreamKey: false,
      streamDestinations: [{ id: "primary", name: "Primary Stream", rtmpUrl: "", enabled: true }],
      operatorStationName: "Main Director",
      operatorRole: "director",
      masterAudioGain: 1,
      theme: "system",
      lowerThird: defaultLowerThird,
      networkOutput: defaultNetworkOutput,
      integrations: defaultIntegrations,
      studioState: defaultStudioState
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
      rememberStreamKey: { type: "boolean" },
      streamDestinations: { type: "array" },
      operatorStationName: { type: "string" },
      operatorRole: { type: "string" },
      masterAudioGain: { type: "number" },
      theme: { type: "string" },
      lowerThird: { type: "object" },
      networkOutput: { type: "object" },
      integrations: { type: "object" },
      studioState: { type: "object" }
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
  const stored = getStore().store;
  const destinations =
    stored.streamDestinations?.length
      ? stored.streamDestinations
      : [{ id: "primary", name: "Primary Stream", rtmpUrl: stored.streamRtmpUrl ?? "", enabled: true }];
  return {
    ...stored,
    streamDestinations: destinations,
    operatorStationName: stored.operatorStationName || "Main Director",
    operatorRole: stored.operatorRole || "director",
    masterAudioGain: Number.isFinite(stored.masterAudioGain) ? stored.masterAudioGain : 1,
    theme: allowedThemes.includes(stored.theme) ? stored.theme : "system",
    lowerThird: { ...defaultLowerThird, ...(stored.lowerThird ?? {}) },
    networkOutput: { ...defaultNetworkOutput, ...(stored.networkOutput ?? {}) },
    integrations: { ...defaultIntegrations, ...(stored.integrations ?? {}) }
  };
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

  if (Array.isArray(update.streamDestinations)) {
    sanitized.streamDestinations = update.streamDestinations
      .filter((destination) => destination && typeof destination.id === "string")
      .map((destination) => ({
        id: destination.id,
        name: typeof destination.name === "string" ? destination.name : "Stream",
        rtmpUrl: typeof destination.rtmpUrl === "string" ? destination.rtmpUrl : "",
        enabled: destination.enabled !== false,
        platform: ["custom", "youtube", "facebook"].includes(destination.platform ?? "") ? destination.platform : "custom",
        authorizedAccount: typeof destination.authorizedAccount === "string" ? destination.authorizedAccount.slice(0, 160) : null
      }));
  }

  if (typeof update.operatorStationName === "string") {
    sanitized.operatorStationName = update.operatorStationName.slice(0, 80);
  }

  if (allowedOperatorRoles.includes(update.operatorRole as string)) {
    sanitized.operatorRole = update.operatorRole;
  }

  if (typeof update.masterAudioGain === "number" && Number.isFinite(update.masterAudioGain)) {
    sanitized.masterAudioGain = Math.max(0, Math.min(2, update.masterAudioGain));
  }

  if (allowedThemes.includes(update.theme as ThemePreference)) {
    sanitized.theme = update.theme;
  }

  if (update.lowerThird && typeof update.lowerThird === "object") {
    sanitized.lowerThird = {
      ...defaultLowerThird,
      ...update.lowerThird,
      heightPercent: Math.max(10, Math.min(50, update.lowerThird.heightPercent ?? defaultLowerThird.heightPercent)),
      fontSize: Math.max(16, Math.min(160, update.lowerThird.fontSize ?? defaultLowerThird.fontSize)),
      animationDurationMs: Math.max(100, Math.min(3000, update.lowerThird.animationDurationMs ?? defaultLowerThird.animationDurationMs)),
      maxLines: Math.max(0, Math.min(20, update.lowerThird.maxLines ?? defaultLowerThird.maxLines)),
      slides: Array.isArray(update.lowerThird.slides) ? update.lowerThird.slides.slice(0, 500) : defaultLowerThird.slides
    };
  }

  if (update.networkOutput && typeof update.networkOutput === "object") {
    sanitized.networkOutput = {
      ...defaultNetworkOutput,
      ...update.networkOutput,
      port: Math.max(1024, Math.min(65535, update.networkOutput.port ?? defaultNetworkOutput.port)),
      operatorPin: String(update.networkOutput.operatorPin ?? defaultNetworkOutput.operatorPin).slice(0, 16)
    };
  }

  if (update.integrations && typeof update.integrations === "object") {
    sanitized.integrations = {
      ...defaultIntegrations,
      ...update.integrations
    };
  }

  if (typeof update.studioState === "object" && update.studioState) {
    sanitized.studioState = update.studioState;
  }

  return sanitized;
};

export const updateSettings = (update: SettingsUpdate): Settings => {
  const sanitized = sanitizeSettingsUpdate(update);
  const storeInstance = getStore();
  storeInstance.set(sanitized);
  return getSettings();
};

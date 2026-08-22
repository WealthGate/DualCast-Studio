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
import { normalizeStudioState } from "../../src/shared/settings";

let store: Store<Settings> | null = null;

const allowedQuality: QualityPreset[] = ["low", "medium", "high"];
const allowedFrameRates: FrameRatePreset[] = [15, 24, 25, 30, 50, 60];
const allowedAudio: AudioMode[] = ["system", "microphone", "both", "none"];
const allowedStreamingPresets: StreamingPreset[] = ["low", "medium", "high"];
const allowedStreamingFps: StreamingFps[] = [15, 24, 25, 30, 50, 60];
const allowedStreamingAudio: StreamingAudioBitrate[] = [128, 192];
const allowedStreamingEncoders: StreamingEncoder[] = ["auto", "x264", "nvenc", "qsv", "amf"];
const allowedOperatorRoles = ["director", "graphics", "audio", "stream"];
const allowedThemes: ThemePreference[] = ["system", "dark", "light", "high-contrast", "midnight", "warm"];
const allowedLowerThirdAnimations = ["none", "fade", "slide-left", "slide-right", "slide-up", "zoom", "wipe"] as const;

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
  backgroundOpacity: 1,
  backgroundImageUrl: "",
  backgroundImageOpacity: 0.45,
  textColor: "#ffffff",
  fontSize: 48,
  fontFamily: "Segoe UI",
  bold: true,
  italic: false,
  underline: false,
  textAlign: "center" as const,
  imageUrl: "",
  imagePosition: "left" as const,
  bibleImageUrl: "",
  bibleImagePosition: "left" as const,
  entranceAnimation: "fade" as const,
  exitAnimation: "fade" as const,
  animationDurationMs: 450,
  showOnProgram: true,
  maxLines: 0,
  slides: [],
  activeSlideId: null,
  programSlideId: null,
  allowMultipleTextLayers: false
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
      microphoneDeviceId: null,
      microphoneGain: 1,
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
      microphoneDeviceId: { type: ["string", "null"] },
      microphoneGain: { type: "number" },
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

const finiteNumber = (value: unknown, fallback: number, min: number, max: number) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
};

const normalizeDestinations = (value: unknown): Settings["streamDestinations"] => {
  const seen = new Set<string>();
  const destinations = (Array.isArray(value) ? value : []).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const destination = entry as Partial<Settings["streamDestinations"][number]>;
    const id = typeof destination.id === "string" ? destination.id.slice(0, 120) : "";
    if (!id || seen.has(id)) return [];
    seen.add(id);
    return [{
      id,
      name: typeof destination.name === "string" ? destination.name.slice(0, 160) || "Stream" : "Stream",
      rtmpUrl: typeof destination.rtmpUrl === "string" ? destination.rtmpUrl.slice(0, 2_048) : "",
      enabled: destination.enabled !== false,
      platform: destination.platform === "youtube" || destination.platform === "facebook" ? destination.platform : "custom" as const,
      authorizedAccount: typeof destination.authorizedAccount === "string" ? destination.authorizedAccount.slice(0, 160) : null
    }];
  }).slice(0, 12);
  return destinations.length ? destinations : [{ id: "primary", name: "Primary Stream", rtmpUrl: "", enabled: true, platform: "custom" }];
};

const normalizeLowerThird = (value: unknown): Settings["lowerThird"] => {
  const raw = value && typeof value === "object" && !Array.isArray(value)
    ? value as Partial<Settings["lowerThird"]>
    : {};
  const slides = (Array.isArray(raw.slides) ? raw.slides : []).flatMap((entry) => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return [];
    const slide = entry as Settings["lowerThird"]["slides"][number];
    if (typeof slide.id !== "string" || !slide.id || typeof slide.text !== "string") return [];
    return [{
      id: slide.id.slice(0, 200),
      text: slide.text.slice(0, 100_000),
      reference: typeof slide.reference === "string" ? slide.reference.slice(0, 500) : undefined,
      kind: slide.kind === "song" || slide.kind === "scripture" ? slide.kind : "text" as const,
      deckId: typeof slide.deckId === "string" ? slide.deckId.slice(0, 200) : undefined,
      deckTitle: typeof slide.deckTitle === "string" ? slide.deckTitle.slice(0, 300) : undefined
    }];
  }).slice(0, 500);
  const activeSlideId = typeof raw.activeSlideId === "string" && slides.some((slide) => slide.id === raw.activeSlideId)
    ? raw.activeSlideId
    : null;
  const programSlideId = typeof raw.programSlideId === "string" && slides.some((slide) => slide.id === raw.programSlideId)
    ? raw.programSlideId
    : raw.programSlideId === undefined
      ? activeSlideId
      : null;
  return {
    ...defaultLowerThird,
    enabled: raw.enabled === true,
    displayId: typeof raw.displayId === "string" ? raw.displayId : null,
    heightPercent: finiteNumber(raw.heightPercent, defaultLowerThird.heightPercent, 10, 50),
    position: raw.position === "top" ? "top" : "bottom",
    backgroundColor: typeof raw.backgroundColor === "string" ? raw.backgroundColor.slice(0, 64) : defaultLowerThird.backgroundColor,
    backgroundOpacity: finiteNumber(raw.backgroundOpacity, defaultLowerThird.backgroundOpacity, 0, 1),
    backgroundImageUrl: typeof raw.backgroundImageUrl === "string" ? raw.backgroundImageUrl.slice(0, 4_096) : "",
    backgroundImageOpacity: finiteNumber(raw.backgroundImageOpacity, defaultLowerThird.backgroundImageOpacity, 0, 1),
    textColor: typeof raw.textColor === "string" ? raw.textColor.slice(0, 64) : defaultLowerThird.textColor,
    fontSize: finiteNumber(raw.fontSize, defaultLowerThird.fontSize, 16, 160),
    fontFamily: typeof raw.fontFamily === "string" ? raw.fontFamily.slice(0, 120) : defaultLowerThird.fontFamily,
    bold: raw.bold !== false,
    italic: raw.italic === true,
    underline: raw.underline === true,
    textAlign: raw.textAlign === "left" || raw.textAlign === "right" ? raw.textAlign : "center",
    imageUrl: typeof raw.imageUrl === "string" ? raw.imageUrl.slice(0, 4_096) : "",
    imagePosition: raw.imagePosition === "right" || raw.imagePosition === "background" ? raw.imagePosition : "left",
    bibleImageUrl: typeof raw.bibleImageUrl === "string" ? raw.bibleImageUrl.slice(0, 4_096) : "",
    bibleImagePosition: raw.bibleImagePosition === "right" || raw.bibleImagePosition === "background" ? raw.bibleImagePosition : "left",
    entranceAnimation: allowedLowerThirdAnimations.includes(raw.entranceAnimation as typeof allowedLowerThirdAnimations[number])
      ? raw.entranceAnimation as typeof allowedLowerThirdAnimations[number]
      : defaultLowerThird.entranceAnimation,
    exitAnimation: allowedLowerThirdAnimations.includes(raw.exitAnimation as typeof allowedLowerThirdAnimations[number])
      ? raw.exitAnimation as typeof allowedLowerThirdAnimations[number]
      : defaultLowerThird.exitAnimation,
    animationDurationMs: finiteNumber(raw.animationDurationMs, defaultLowerThird.animationDurationMs, 100, 3_000),
    showOnProgram: raw.showOnProgram !== false,
    maxLines: finiteNumber(raw.maxLines, defaultLowerThird.maxLines, 0, 20),
    slides,
    activeSlideId,
    programSlideId,
    allowMultipleTextLayers: raw.allowMultipleTextLayers === true
  };
};

export const getSettings = (): Settings => {
  const stored = getStore().store;
  const destinations = normalizeDestinations(stored.streamDestinations?.length
    ? stored.streamDestinations
    : [{ id: "primary", name: "Primary Stream", rtmpUrl: stored.streamRtmpUrl ?? "", enabled: true }]);
  return {
    ...stored,
    saveDirectory: typeof stored.saveDirectory === "string" && stored.saveDirectory ? stored.saveDirectory : getDefaultSaveDirectory(),
    qualityPreset: allowedQuality.includes(stored.qualityPreset) ? stored.qualityPreset : "medium",
    frameRate: allowedFrameRates.includes(stored.frameRate) ? stored.frameRate : 30,
    audioMode: allowedAudio.includes(stored.audioMode) ? stored.audioMode : "system",
    streamPreset: allowedStreamingPresets.includes(stored.streamPreset) ? stored.streamPreset : "medium",
    streamFps: allowedStreamingFps.includes(stored.streamFps) ? stored.streamFps : 30,
    streamAudioBitrate: allowedStreamingAudio.includes(stored.streamAudioBitrate) ? stored.streamAudioBitrate : 128,
    streamEncoder: allowedStreamingEncoders.includes(stored.streamEncoder) ? stored.streamEncoder : "auto",
    streamDestinations: destinations,
    operatorStationName: stored.operatorStationName || "Main Director",
    operatorRole: stored.operatorRole || "director",
    masterAudioGain: Number.isFinite(stored.masterAudioGain) ? stored.masterAudioGain : 1,
    microphoneDeviceId: typeof stored.microphoneDeviceId === "string" ? stored.microphoneDeviceId : null,
    microphoneGain: Number.isFinite(stored.microphoneGain) ? stored.microphoneGain : 1,
    theme: allowedThemes.includes(stored.theme) ? stored.theme : "system",
    lowerThird: normalizeLowerThird(stored.lowerThird),
    networkOutput: {
      enabled: stored.networkOutput?.enabled === true,
      port: finiteNumber(stored.networkOutput?.port, defaultNetworkOutput.port, 1024, 65535),
      operatorPin: String(stored.networkOutput?.operatorPin ?? defaultNetworkOutput.operatorPin).slice(0, 16) || defaultNetworkOutput.operatorPin
    },
    integrations: { ...defaultIntegrations, ...(stored.integrations ?? {}) },
    studioState: normalizeStudioState(stored.studioState)
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

  if (typeof update.microphoneDeviceId === "string" || update.microphoneDeviceId === null) {
    sanitized.microphoneDeviceId = update.microphoneDeviceId;
  }

  if (typeof update.microphoneGain === "number" && Number.isFinite(update.microphoneGain)) {
    sanitized.microphoneGain = Math.max(0, Math.min(2, update.microphoneGain));
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
    sanitized.streamDestinations = normalizeDestinations(update.streamDestinations);
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
    sanitized.lowerThird = normalizeLowerThird(update.lowerThird);
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
    sanitized.studioState = normalizeStudioState(update.studioState);
  }

  return sanitized;
};

export const updateSettings = (update: SettingsUpdate): Settings => {
  const sanitized = sanitizeSettingsUpdate(update);
  const storeInstance = getStore();
  storeInstance.set(sanitized);
  return getSettings();
};

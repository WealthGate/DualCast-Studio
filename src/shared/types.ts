export type AudioMode = "system" | "microphone" | "both" | "none";
export type AudioRoutingScope = "scene" | "persistent";
export type QualityPreset = "low" | "medium" | "high";
export type FrameRatePreset = 15 | 24 | 25 | 30 | 50 | 60;
export type StreamingPreset = "low" | "medium" | "high";
export type StreamingFps = 15 | 24 | 25 | 30 | 50 | 60;
export type StreamingAudioBitrate = 128 | 192;
export type StreamingEncoder =
  | "auto"
  | "x264"
  | "nvenc"
  | "qsv"
  | "amf"
  | "mediafoundation"
  | "videotoolbox"
  | "vaapi"
  | "v4l2m2m";
export type OperatorRole = "director" | "graphics" | "audio" | "stream";
export type TextSourceRole = "standard" | "lower-third" | "presentation";
export type ThemePreference = "system" | "dark" | "light" | "high-contrast" | "midnight" | "warm";
export type LowerThirdAnimation = "none" | "fade" | "slide-left" | "slide-right" | "slide-up" | "zoom" | "wipe";
export type WorkspaceViewMode = "studio" | "program-focus" | "program-only";
export type StreamPlatform = "custom" | "youtube" | "facebook";
export type StreamingCredentialProvider = "youtube" | "facebook";
export type StreamVisibility = "public" | "unlisted" | "private";
export type YouTubeLatencyPreference = "normal" | "low" | "ultraLow";

export type YouTubeBroadcastSettings = {
  title: string;
  description: string;
  visibility: StreamVisibility;
  categoryId: string;
  madeForKids: boolean;
  scheduledStartTime: string;
  latencyPreference: YouTubeLatencyPreference;
  enableDvr: boolean;
  enableAutoStart: boolean;
  enableAutoStop: boolean;
  enableEmbed: boolean;
};

export type CaptureSourceType = "screen" | "window";

export type SourceType = "display" | "window" | "camera" | "image" | "video" | "browser" | "audio" | "text";

export type SourceRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type SourceCrop = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

export type SourceGroup = {
  id: string;
  name: string;
  locked?: boolean;
};

export type Scene = {
  id: string;
  name: string;
  sourceIds: string[];
  locked?: boolean;
};

type SourceBase = {
  id: string;
  name: string;
  type: SourceType;
  rect: SourceRect;
  enabled: boolean;
  audioEnabled: boolean;
  audioScope?: AudioRoutingScope;
  captureCursor?: "never" | "motion" | "always";
  volume?: number;
  rotation?: number;
  crop?: SourceCrop;
  locked?: boolean;
  groupId?: string | null;
  media?: {
    paused?: boolean;
    restartToken?: number;
  };
};

export type Source =
  | (SourceBase & { type: "display" | "window"; data: { captureId: string } })
  | (SourceBase & { type: "camera"; data: { deviceId: string } })
  | (SourceBase & { type: "image"; data: { url: string } })
  | (SourceBase & { type: "video"; data: { url: string; loop: boolean } })
  | (SourceBase & { type: "browser"; data: { url: string } })
  | (SourceBase & { type: "audio"; data: { url: string; loop: boolean } })
  | (SourceBase & {
      type: "text";
      data: {
        text: string;
        fontSize: number;
        color: string;
        backgroundColor: string;
        align: "left" | "center" | "right";
        role?: TextSourceRole;
      };
    });

export type StudioState = {
  scenes: Scene[];
  sources: Record<string, Source>;
  groups: SourceGroup[];
  previewSceneId: string | null;
  programSceneId: string | null;
};

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

export type StreamDestinationConfig = {
  id: string;
  name: string;
  rtmpUrl: string;
  enabled: boolean;
  platform?: StreamPlatform;
  authorizedAccount?: string | null;
  broadcast?: YouTubeBroadcastSettings;
  providerBroadcastId?: string | null;
};

export type StreamDestinationInput = StreamDestinationConfig & {
  streamKey: string;
};

export type LowerThirdSlide = {
  id: string;
  text: string;
  reference?: string;
  kind?: "text" | "song" | "scripture";
  deckId?: string;
  deckTitle?: string;
};

export type LowerThirdSettings = {
  enabled: boolean;
  displayId: string | null;
  heightPercent: number;
  position: "top" | "bottom";
  backgroundColor: string;
  backgroundOpacity: number;
  backgroundImageUrl: string;
  backgroundImageOpacity: number;
  textColor: string;
  fontSize: number;
  fontFamily: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
  textAlign: "left" | "center" | "right";
  imageUrl: string;
  imagePosition: "left" | "right" | "background";
  bibleImageUrl: string;
  bibleImagePosition: "left" | "right" | "background";
  entranceAnimation: LowerThirdAnimation;
  exitAnimation: LowerThirdAnimation;
  animationDurationMs: number;
  showOnProgram: boolean;
  maxLines: number;
  slides: LowerThirdSlide[];
  /** The slide staged in Preview. */
  activeSlideId: string | null;
  /** The independently committed slide visible on Program. */
  programSlideId: string | null;
  /** Opt-in override for operators who intentionally want stacked presentation text. */
  allowMultipleTextLayers: boolean;
};

export type NetworkOutputSettings = {
  enabled: boolean;
  port: number;
  operatorPin: string;
};

export type ChurchIntegrationSettings = {
  songProvider: "local" | "planning-center" | "custom";
  songLibraryPath: string;
  songApiUrl: string;
  scriptureProvider: "api-bible" | "bible-api" | "custom";
  scriptureApiUrl: string;
  scriptureApiKeyEnv: string;
  scriptureBibleId: string;
  aiProvider: "disabled" | "openai" | "azure-openai" | "custom";
  aiBaseUrl: string;
  aiModel: string;
  aiApiKeyEnv: string;
  aiLiveCaptions: boolean;
  aiSermonSummary: boolean;
  aiHighlightDetection: boolean;
};

export type Settings = {
  saveDirectory: string;
  qualityPreset: QualityPreset;
  frameRate: FrameRatePreset;
  audioMode: AudioMode;
  microphoneDeviceId: string | null;
  microphoneGain: number;
  lastDisplayId: string | null;
  streamRtmpUrl: string;
  streamPreset: StreamingPreset;
  streamFps: StreamingFps;
  streamAudioBitrate: StreamingAudioBitrate;
  streamEncoder: StreamingEncoder;
  rememberStreamKey: boolean;
  streamDestinations: StreamDestinationConfig[];
  operatorStationName: string;
  operatorRole: OperatorRole;
  masterAudioGain: number;
  theme: ThemePreference;
  lowerThird: LowerThirdSettings;
  networkOutput: NetworkOutputSettings;
  integrations: ChurchIntegrationSettings;
  studioState: StudioState;
};

export type SettingsUpdate = Partial<Settings>;

export type SaveRecordingPayload = {
  data: Uint8Array | ArrayBuffer | number[];
};

export type RecordingChunkPayload = SaveRecordingPayload & {
  sessionId: string;
};

export type RecordingSessionPayload = {
  sessionId: string;
};

export type SaveRecordingResult = {
  filePath: string;
  fileName: string;
  usedFallback: boolean;
};

export type MediaFileResult = {
  filePath: string;
  fileUrl: string;
  name: string;
};

export type BrowserFramePayload = {
  sourceId: string;
  dataUrl: string;
};

export type BrowserSourcePayload = {
  sourceId: string;
  url: string;
  width: number;
  height: number;
};

export type HotkeyAction = "toggle-record" | "take" | "cut-black";

export type StreamingStatus = "idle" | "connecting" | "live" | "reconnecting" | "error";

export type StreamStartPayload = {
  rtmpUrl?: string;
  streamKey?: string;
  destinations?: StreamDestinationInput[];
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
  destinationStatuses?: Array<{
    id: string;
    name: string;
    status: StreamingStatus;
    message?: string | null;
    reconnectAttempt?: number | null;
  }>;
};

export type NetworkOutputStatus = {
  running: boolean;
  port: number;
  programUrls: string[];
  operatorUrls: string[];
};

export type RemoteOperatorAction = "toggle-record" | "take" | "cut-black" | "toggle-freeze";

export type ExportClipPayload = {
  inputPath: string;
  startSeconds: number;
  endSeconds: number;
};

export type ExportClipResult = {
  filePath: string;
  fileName: string;
};

export type ProgramState = {
  programSceneId: string | null;
  isCutToBlack: boolean;
  isFrozen: boolean;
  qualityPreset: QualityPreset;
};

export type MultiviewTile = {
  id: string;
  kind: "scene" | "camera";
  name: string;
  sceneId: string;
  subtitle?: string;
  dataUrl?: string;
};

export type MultiviewPayload = {
  previewSceneId: string | null;
  programSceneId: string | null;
  tiles: MultiviewTile[];
};

export type MultiviewAction = {
  action: "preview" | "program";
  sceneId: string;
};

export type UpdateState = "idle" | "checking" | "available" | "downloading" | "downloaded" | "up-to-date" | "error";

export type UpdateStatusPayload = {
  state: UpdateState;
  currentVersion: string;
  latestVersion?: string | null;
  progressPercent?: number | null;
  message?: string | null;
};

export type ScriptureFetchPayload = {
  reference: string;
};

export type ScriptureFetchResult = {
  reference: string;
  text: string;
  translation?: string;
  verses?: Array<{
    reference: string;
    text: string;
  }>;
};

export type ScriptureLibrarySummary = {
  id: string;
  name: string;
  translation?: string;
  source?: string;
  passageCount: number;
  savedPassages?: boolean;
};

export type ScriptureLibraryLookupPayload = {
  libraryId: string;
  reference: string;
};

export type ScriptureLibraryDownloadPayload = {
  url: string;
};

export type ScriptureLibraryRemovePayload = {
  libraryId: string;
};

export type ScriptureLibraryCatalog = {
  libraryId: string;
  books: Array<{
    name: string;
    chapters: Array<{
      number: number;
      verses: number[];
    }>;
  }>;
};

export type SongLibraryEntry = {
  id: string;
  title: string;
  lyrics: string;
  source?: string;
};

export type SongDownloadPayload = {
  url: string;
};

export type SongRemovePayload = {
  songId: string;
};

export type StreamingAuthorizationPayload = {
  provider: "youtube" | "facebook";
  destinationId: string;
  broadcast?: YouTubeBroadcastSettings;
  preset?: StreamingPreset;
  fps?: StreamingFps;
  forceAccountSelection?: boolean;
};

export type StreamingAuthorizationResult = {
  ok: boolean;
  message: string;
  account?: string;
  rtmpUrl?: string;
  streamKey?: string;
  broadcastId?: string;
  broadcastUrl?: string;
};

export type StreamingCredentialInput = {
  provider: StreamingCredentialProvider;
  clientId: string;
  clientSecret?: string;
};

export type StreamingCredentialStatus = {
  provider: StreamingCredentialProvider;
  configured: boolean;
  source: "secure" | "environment" | "none";
  clientIdHint?: string;
  account?: string | null;
};

export type AppCommand =
  | "open-settings"
  | "open-stream-setup"
  | "open-auto-config"
  | "profile-new"
  | "profile-duplicate"
  | "profile-manage"
  | "toggle-studio";

import {
  DisplaySource,
  SaveRecordingPayload,
  RecordingChunkPayload,
  RecordingSessionPayload,
  SaveRecordingResult,
  MediaFileResult,
  MultiviewAction,
  MultiviewPayload,
  UpdateStatusPayload,
  Settings,
  SettingsUpdate,
  HotkeyAction,
  ProgramState,
  BrowserFramePayload,
  BrowserSourcePayload,
  StreamStartPayload,
  StreamStartResult,
  StreamStopResult,
  StreamStatusPayload,
  StreamingEncoder,
  ExportClipPayload,
  ExportClipResult,
  NetworkOutputStatus,
  RemoteOperatorAction,
  ScriptureFetchPayload,
  ScriptureFetchResult,
  ScriptureLibraryDownloadPayload,
  ScriptureLibraryLookupPayload,
  ScriptureLibraryRemovePayload,
  ScriptureLibraryCatalog,
  ScriptureLibrarySummary,
  SongDownloadPayload,
  SongLibraryEntry,
  SongRemovePayload,
  StreamingAuthorizationPayload,
  StreamingAuthorizationResult
} from "../shared/types";

declare global {
  interface Window {
    dualcast: {
      listDisplays: () => Promise<DisplaySource[]>;
      getSettings: () => Promise<Settings>;
      updateSettings: (update: SettingsUpdate) => Promise<Settings>;
      selectSaveDirectory: () => Promise<string | null>;
      saveRecording: (payload: SaveRecordingPayload) => Promise<SaveRecordingResult>;
      beginRecording: () => Promise<{ sessionId: string }>;
      appendRecordingChunk: (payload: RecordingChunkPayload) => Promise<boolean>;
      finishRecording: (payload: RecordingSessionPayload) => Promise<SaveRecordingResult>;
      cancelRecording: (payload: RecordingSessionPayload) => Promise<boolean>;
      openFolder: (filePath: string) => Promise<boolean>;
      openProjection: (displayIds: string[]) => Promise<boolean>;
      closeProjection: () => Promise<boolean>;
      openLowerThird: (displayId: string) => Promise<boolean>;
      closeLowerThird: () => Promise<boolean>;
      openMultiview: () => Promise<boolean>;
      closeMultiview: () => Promise<boolean>;
      getUpdateStatus: () => Promise<UpdateStatusPayload>;
      checkForUpdates: () => Promise<UpdateStatusPayload>;
      downloadUpdate: () => Promise<boolean>;
      installUpdate: () => Promise<boolean>;
      openReleasePage: () => Promise<boolean>;
      startStream: (payload: StreamStartPayload) => Promise<StreamStartResult>;
      stopStream: () => Promise<StreamStopResult>;
      sendStreamChunk: (payload: Uint8Array) => Promise<boolean>;
      getStreamLogPath: () => Promise<string | null>;
      getStreamLogContent: (payload: { maxLines?: number }) => Promise<string>;
      getStreamingCapabilities: () => Promise<{ encoders: StreamingEncoder[]; secureStorageAvailable: boolean }>;
      getStoredStreamKey: (payload?: { destinationId?: string }) => Promise<string | null>;
      setStoredStreamKey: (payload: { destinationId?: string; streamKey: string }) => Promise<boolean>;
      clearStoredStreamKey: (payload?: { destinationId?: string }) => Promise<boolean>;
      startNetworkOutput: (payload: { port: number; operatorPin: string }) => Promise<NetworkOutputStatus>;
      stopNetworkOutput: () => Promise<NetworkOutputStatus>;
      getNetworkOutputStatus: () => Promise<NetworkOutputStatus>;
      exportClip: (payload: ExportClipPayload) => Promise<ExportClipResult>;
      selectMediaFile: (payload: { kind: "image" | "video" | "audio" }) => Promise<MediaFileResult | null>;
      createBrowserSource: (payload: BrowserSourcePayload) => Promise<boolean>;
      updateBrowserSource: (payload: BrowserSourcePayload) => Promise<boolean>;
      destroyBrowserSource: (payload: { sourceId: string }) => Promise<boolean>;
      fetchScripture: (payload: ScriptureFetchPayload) => Promise<ScriptureFetchResult>;
      listScriptureLibraries: () => Promise<ScriptureLibrarySummary[]>;
      lookupScriptureLibrary: (payload: ScriptureLibraryLookupPayload) => Promise<ScriptureFetchResult>;
      importScriptureLibrary: () => Promise<ScriptureLibrarySummary | null>;
      downloadScriptureLibrary: (payload: ScriptureLibraryDownloadPayload) => Promise<ScriptureLibrarySummary>;
      saveScripturePassage: (payload: ScriptureFetchResult) => Promise<ScriptureLibrarySummary>;
      removeScriptureLibrary: (payload: ScriptureLibraryRemovePayload) => Promise<boolean>;
      getScriptureLibraryCatalog: (libraryId: string) => Promise<ScriptureLibraryCatalog>;
      listSongs: () => Promise<SongLibraryEntry[]>;
      importSong: () => Promise<SongLibraryEntry | null>;
      downloadSong: (payload: SongDownloadPayload) => Promise<SongLibraryEntry>;
      removeSong: (payload: SongRemovePayload) => Promise<boolean>;
      authorizeStreaming: (payload: StreamingAuthorizationPayload) => Promise<StreamingAuthorizationResult>;
      downloadUserGuide: () => Promise<string | null>;
      onStreamStatus: (handler: (payload: StreamStatusPayload) => void) => () => void;
      updateProgramState: (state: ProgramState) => void;
      sendProgramFrame: (dataUrl: string) => void;
      sendLowerThirdFrame: (dataUrl: string) => void;
      sendMultiviewData: (payload: MultiviewPayload) => void;
      sendMultiviewAction: (action: MultiviewAction) => void;
      onBrowserFrame: (handler: (payload: BrowserFramePayload) => void) => () => void;
      onProgramFrame: (handler: (dataUrl: string) => void) => () => void;
      onLowerThirdFrame: (handler: (dataUrl: string) => void) => () => void;
      onProgramState: (handler: (state: ProgramState) => void) => () => void;
      onProjectionOpened: (handler: () => void) => () => void;
      onProjectionClosed: (handler: () => void) => () => void;
      onLowerThirdOpened: (handler: () => void) => () => void;
      onLowerThirdClosed: (handler: () => void) => () => void;
      onMultiviewOpened: (handler: () => void) => () => void;
      onMultiviewClosed: (handler: () => void) => () => void;
      onMultiviewData: (handler: (payload: MultiviewPayload) => void) => () => void;
      onMultiviewAction: (handler: (action: MultiviewAction) => void) => () => void;
      onUpdateStatus: (handler: (status: UpdateStatusPayload) => void) => () => void;
      onHotkey: (handler: (action: HotkeyAction) => void) => () => void;
      onRemoteOperatorAction: (handler: (action: RemoteOperatorAction) => void) => () => void;
    };
  }
}

export {};

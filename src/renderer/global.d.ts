import {
  DisplaySource,
  SaveRecordingPayload,
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
  RemoteOperatorAction
} from "../shared/types";

declare global {
  interface Window {
    dualcast: {
      listDisplays: () => Promise<DisplaySource[]>;
      getSettings: () => Promise<Settings>;
      updateSettings: (update: SettingsUpdate) => Promise<Settings>;
      selectSaveDirectory: () => Promise<string | null>;
      saveRecording: (payload: SaveRecordingPayload) => Promise<SaveRecordingResult>;
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
      sendStreamChunk: (payload: Uint8Array) => void;
      getStreamLogPath: () => Promise<string | null>;
      getStreamLogContent: (payload: { maxLines?: number }) => Promise<string>;
      getStreamingCapabilities: () => Promise<{ encoders: StreamingEncoder[] }>;
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

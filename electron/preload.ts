import { contextBridge, ipcRenderer } from "electron";
import { IpcChannels } from "../src/shared/ipc";
import {
  SaveRecordingPayload,
  RecordingChunkPayload,
  RecordingSessionPayload,
  DisplaySource,
  Settings,
  SaveRecordingResult,
  SettingsUpdate,
  HotkeyAction,
  ProgramState,
  StreamStartPayload,
  StreamStartResult,
  StreamStopResult,
  StreamStatusPayload,
  StreamingEncoder,
  MediaFileResult,
  MultiviewAction,
  MultiviewPayload,
  UpdateStatusPayload,
  BrowserFramePayload,
  BrowserSourcePayload,
  ExportClipPayload,
  ExportClipResult,
  NetworkOutputStatus,
  RemoteOperatorAction,
  ScriptureFetchPayload,
  ScriptureFetchResult,
  ScriptureLibraryDownloadPayload,
  ScriptureLibraryLookupPayload,
  ScriptureLibraryRemovePayload,
  ScriptureLibrarySummary,
  StreamingAuthorizationPayload,
  StreamingAuthorizationResult
} from "../src/shared/types";

const api = {
  listDisplays: (): Promise<DisplaySource[]> => ipcRenderer.invoke(IpcChannels.listDisplays),
  getSettings: (): Promise<Settings> => ipcRenderer.invoke(IpcChannels.getSettings),
  updateSettings: (update: SettingsUpdate): Promise<Settings> => ipcRenderer.invoke(IpcChannels.updateSettings, update),
  selectSaveDirectory: (): Promise<string | null> => ipcRenderer.invoke(IpcChannels.selectSaveDirectory),
  saveRecording: (payload: SaveRecordingPayload): Promise<SaveRecordingResult> => ipcRenderer.invoke(IpcChannels.saveRecording, payload),
  beginRecording: (): Promise<{ sessionId: string }> => ipcRenderer.invoke(IpcChannels.beginRecording),
  appendRecordingChunk: (payload: RecordingChunkPayload): Promise<boolean> => ipcRenderer.invoke(IpcChannels.appendRecordingChunk, payload),
  finishRecording: (payload: RecordingSessionPayload): Promise<SaveRecordingResult> => ipcRenderer.invoke(IpcChannels.finishRecording, payload),
  cancelRecording: (payload: RecordingSessionPayload): Promise<boolean> => ipcRenderer.invoke(IpcChannels.cancelRecording, payload),
  openFolder: (filePath: string): Promise<boolean> => ipcRenderer.invoke(IpcChannels.openFolder, filePath),
  openProjection: (displayIds: string[]): Promise<boolean> => ipcRenderer.invoke(IpcChannels.openProjection, displayIds),
  closeProjection: (): Promise<boolean> => ipcRenderer.invoke(IpcChannels.closeProjection),
  openLowerThird: (displayId: string): Promise<boolean> => ipcRenderer.invoke(IpcChannels.openLowerThird, displayId),
  closeLowerThird: (): Promise<boolean> => ipcRenderer.invoke(IpcChannels.closeLowerThird),
  openMultiview: (): Promise<boolean> => ipcRenderer.invoke(IpcChannels.openMultiview),
  closeMultiview: (): Promise<boolean> => ipcRenderer.invoke(IpcChannels.closeMultiview),
  getUpdateStatus: (): Promise<UpdateStatusPayload> => ipcRenderer.invoke(IpcChannels.getUpdateStatus),
  checkForUpdates: (): Promise<UpdateStatusPayload> => ipcRenderer.invoke(IpcChannels.checkForUpdates),
  downloadUpdate: (): Promise<boolean> => ipcRenderer.invoke(IpcChannels.downloadUpdate),
  installUpdate: (): Promise<boolean> => ipcRenderer.invoke(IpcChannels.installUpdate),
  openReleasePage: (): Promise<boolean> => ipcRenderer.invoke(IpcChannels.openReleasePage),
  startStream: (payload: StreamStartPayload): Promise<StreamStartResult> =>
    ipcRenderer.invoke(IpcChannels.startStream, payload),
  stopStream: (): Promise<StreamStopResult> => ipcRenderer.invoke(IpcChannels.stopStream),
  sendStreamChunk: (payload: Uint8Array): Promise<boolean> => ipcRenderer.invoke(IpcChannels.streamChunk, payload),
  getStreamLogPath: (): Promise<string | null> => ipcRenderer.invoke(IpcChannels.getStreamLogPath),
  getStreamLogContent: (payload: { maxLines?: number }): Promise<string> =>
    ipcRenderer.invoke(IpcChannels.getStreamLogContent, payload),
  getStreamingCapabilities: (): Promise<{ encoders: StreamingEncoder[]; secureStorageAvailable: boolean }> =>
    ipcRenderer.invoke(IpcChannels.getStreamingCapabilities),
  getStoredStreamKey: (payload?: { destinationId?: string }): Promise<string | null> =>
    ipcRenderer.invoke(IpcChannels.getStoredStreamKey, payload),
  setStoredStreamKey: (payload: { destinationId?: string; streamKey: string }): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.setStoredStreamKey, payload),
  clearStoredStreamKey: (payload?: { destinationId?: string }): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.clearStoredStreamKey, payload),
  startNetworkOutput: (payload: { port: number; operatorPin: string }): Promise<NetworkOutputStatus> =>
    ipcRenderer.invoke(IpcChannels.startNetworkOutput, payload),
  stopNetworkOutput: (): Promise<NetworkOutputStatus> => ipcRenderer.invoke(IpcChannels.stopNetworkOutput),
  getNetworkOutputStatus: (): Promise<NetworkOutputStatus> => ipcRenderer.invoke(IpcChannels.getNetworkOutputStatus),
  exportClip: (payload: ExportClipPayload): Promise<ExportClipResult> =>
    ipcRenderer.invoke(IpcChannels.exportClip, payload),
  selectMediaFile: (payload: { kind: "image" | "video" | "audio" }): Promise<MediaFileResult | null> =>
    ipcRenderer.invoke(IpcChannels.selectMediaFile, payload),
  createBrowserSource: (payload: BrowserSourcePayload): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.createBrowserSource, payload),
  updateBrowserSource: (payload: BrowserSourcePayload): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.updateBrowserSource, payload),
  destroyBrowserSource: (payload: { sourceId: string }): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.destroyBrowserSource, payload),
  fetchScripture: (payload: ScriptureFetchPayload): Promise<ScriptureFetchResult> =>
    ipcRenderer.invoke(IpcChannels.fetchScripture, payload),
  listScriptureLibraries: (): Promise<ScriptureLibrarySummary[]> =>
    ipcRenderer.invoke(IpcChannels.listScriptureLibraries),
  lookupScriptureLibrary: (payload: ScriptureLibraryLookupPayload): Promise<ScriptureFetchResult> =>
    ipcRenderer.invoke(IpcChannels.lookupScriptureLibrary, payload),
  importScriptureLibrary: (): Promise<ScriptureLibrarySummary | null> =>
    ipcRenderer.invoke(IpcChannels.importScriptureLibrary),
  downloadScriptureLibrary: (payload: ScriptureLibraryDownloadPayload): Promise<ScriptureLibrarySummary> =>
    ipcRenderer.invoke(IpcChannels.downloadScriptureLibrary, payload),
  saveScripturePassage: (payload: ScriptureFetchResult): Promise<ScriptureLibrarySummary> =>
    ipcRenderer.invoke(IpcChannels.saveScripturePassage, payload),
  removeScriptureLibrary: (payload: ScriptureLibraryRemovePayload): Promise<boolean> =>
    ipcRenderer.invoke(IpcChannels.removeScriptureLibrary, payload),
  authorizeStreaming: (payload: StreamingAuthorizationPayload): Promise<StreamingAuthorizationResult> =>
    ipcRenderer.invoke(IpcChannels.authorizeStreaming, payload),
  downloadUserGuide: (): Promise<string | null> => ipcRenderer.invoke(IpcChannels.downloadUserGuide),
  updateProgramState: (state: ProgramState) => ipcRenderer.send(IpcChannels.updateProgramState, state),
  sendProgramFrame: (dataUrl: string) => ipcRenderer.send(IpcChannels.programFrame, dataUrl),
  sendLowerThirdFrame: (dataUrl: string) => ipcRenderer.send(IpcChannels.lowerThirdFrame, dataUrl),
  sendMultiviewData: (payload: MultiviewPayload) => ipcRenderer.send(IpcChannels.multiviewData, payload),
  sendMultiviewAction: (action: MultiviewAction) => ipcRenderer.send(IpcChannels.multiviewAction, action),
  onStreamStatus: (handler: (payload: StreamStatusPayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: StreamStatusPayload) => handler(payload);
    ipcRenderer.on(IpcChannels.streamStatus, listener);
    return () => ipcRenderer.removeListener(IpcChannels.streamStatus, listener);
  },
  onProgramFrame: (handler: (dataUrl: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: string) => handler(payload);
    ipcRenderer.on(IpcChannels.programFrame, listener);
    return () => ipcRenderer.removeListener(IpcChannels.programFrame, listener);
  },
  onLowerThirdFrame: (handler: (dataUrl: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: string) => handler(payload);
    ipcRenderer.on(IpcChannels.lowerThirdFrame, listener);
    return () => ipcRenderer.removeListener(IpcChannels.lowerThirdFrame, listener);
  },
  onBrowserFrame: (handler: (payload: BrowserFramePayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: BrowserFramePayload) => handler(payload);
    ipcRenderer.on(IpcChannels.browserFrame, listener);
    return () => ipcRenderer.removeListener(IpcChannels.browserFrame, listener);
  },
  onProgramState: (handler: (state: ProgramState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: ProgramState) => handler(payload);
    ipcRenderer.on(IpcChannels.programState, listener);
    return () => ipcRenderer.removeListener(IpcChannels.programState, listener);
  },
  onProjectionOpened: (handler: () => void) => {
    const listener = () => handler();
    ipcRenderer.on(IpcChannels.projectionOpened, listener);
    return () => ipcRenderer.removeListener(IpcChannels.projectionOpened, listener);
  },
  onHotkey: (handler: (action: HotkeyAction) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { action: HotkeyAction }) => handler(payload.action);
    ipcRenderer.on(IpcChannels.hotkey, listener);
    return () => ipcRenderer.removeListener(IpcChannels.hotkey, listener);
  },
  onProjectionClosed: (handler: () => void) => {
    const listener = () => handler();
    ipcRenderer.on(IpcChannels.projectionClosed, listener);
    return () => ipcRenderer.removeListener(IpcChannels.projectionClosed, listener);
  },
  onLowerThirdOpened: (handler: () => void) => {
    const listener = () => handler();
    ipcRenderer.on(IpcChannels.lowerThirdOpened, listener);
    return () => ipcRenderer.removeListener(IpcChannels.lowerThirdOpened, listener);
  },
  onLowerThirdClosed: (handler: () => void) => {
    const listener = () => handler();
    ipcRenderer.on(IpcChannels.lowerThirdClosed, listener);
    return () => ipcRenderer.removeListener(IpcChannels.lowerThirdClosed, listener);
  },
  onMultiviewOpened: (handler: () => void) => {
    const listener = () => handler();
    ipcRenderer.on(IpcChannels.multiviewOpened, listener);
    return () => ipcRenderer.removeListener(IpcChannels.multiviewOpened, listener);
  },
  onMultiviewClosed: (handler: () => void) => {
    const listener = () => handler();
    ipcRenderer.on(IpcChannels.multiviewClosed, listener);
    return () => ipcRenderer.removeListener(IpcChannels.multiviewClosed, listener);
  },
  onMultiviewData: (handler: (payload: MultiviewPayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: MultiviewPayload) => handler(payload);
    ipcRenderer.on(IpcChannels.multiviewData, listener);
    return () => ipcRenderer.removeListener(IpcChannels.multiviewData, listener);
  },
  onMultiviewAction: (handler: (action: MultiviewAction) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, action: MultiviewAction) => handler(action);
    ipcRenderer.on(IpcChannels.multiviewAction, listener);
    return () => ipcRenderer.removeListener(IpcChannels.multiviewAction, listener);
  },
  onUpdateStatus: (handler: (status: UpdateStatusPayload) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, status: UpdateStatusPayload) => handler(status);
    ipcRenderer.on(IpcChannels.updateStatus, listener);
    return () => ipcRenderer.removeListener(IpcChannels.updateStatus, listener);
  },
  onRemoteOperatorAction: (handler: (action: RemoteOperatorAction) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, action: RemoteOperatorAction) => handler(action);
    ipcRenderer.on(IpcChannels.remoteOperatorAction, listener);
    return () => ipcRenderer.removeListener(IpcChannels.remoteOperatorAction, listener);
  }
};

contextBridge.exposeInMainWorld("dualcast", api);

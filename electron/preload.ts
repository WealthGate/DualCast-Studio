import { contextBridge, ipcRenderer } from "electron";
import { IpcChannels } from "../src/shared/ipc";
import {
  SaveRecordingPayload,
  DisplaySource,
  Settings,
  SaveRecordingResult,
  SettingsUpdate,
  HotkeyAction,
  ProgramState,
  StreamStartPayload,
  StreamStartResult,
  StreamStopResult,
  StreamStatusPayload
} from "../src/shared/types";

const api = {
  listDisplays: (): Promise<DisplaySource[]> => ipcRenderer.invoke(IpcChannels.listDisplays),
  getSettings: (): Promise<Settings> => ipcRenderer.invoke(IpcChannels.getSettings),
  updateSettings: (update: SettingsUpdate): Promise<Settings> => ipcRenderer.invoke(IpcChannels.updateSettings, update),
  selectSaveDirectory: (): Promise<string | null> => ipcRenderer.invoke(IpcChannels.selectSaveDirectory),
  saveRecording: (payload: SaveRecordingPayload): Promise<SaveRecordingResult> => ipcRenderer.invoke(IpcChannels.saveRecording, payload),
  openFolder: (filePath: string): Promise<boolean> => ipcRenderer.invoke(IpcChannels.openFolder, filePath),
  openProjection: (displayId?: string | null): Promise<boolean> => ipcRenderer.invoke(IpcChannels.openProjection, displayId),
  closeProjection: (): Promise<boolean> => ipcRenderer.invoke(IpcChannels.closeProjection),
  startStream: (payload: StreamStartPayload): Promise<StreamStartResult> =>
    ipcRenderer.invoke(IpcChannels.startStream, payload),
  stopStream: (): Promise<StreamStopResult> => ipcRenderer.invoke(IpcChannels.stopStream),
  sendStreamChunk: (payload: Uint8Array) => ipcRenderer.send(IpcChannels.streamChunk, payload),
  getStreamLogPath: (): Promise<string | null> => ipcRenderer.invoke(IpcChannels.getStreamLogPath),
  updateProgramState: (state: ProgramState) => ipcRenderer.send(IpcChannels.updateProgramState, state),
  sendProgramFrame: (dataUrl: string) => ipcRenderer.send(IpcChannels.programFrame, dataUrl),
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
  }
};

contextBridge.exposeInMainWorld("dualcast", api);

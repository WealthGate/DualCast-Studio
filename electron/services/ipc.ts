import { ipcMain, dialog, shell, BrowserWindow } from "electron";
import { IpcChannels } from "../../src/shared/ipc";
import { listDisplays } from "./displayService";
import { getSettings, updateSettings } from "./settingsService";
import { saveRecording } from "./recordingService";
import {
  getStreamLogPath,
  getStreamingCapabilities,
  sendStreamChunk,
  setStreamStatusPublisher,
  startStreaming,
  stopStreaming
} from "./streamingService";
import { clearStreamKey, getStreamKey, setStreamKey } from "./streamKeyService";
import { SaveRecordingPayload, SettingsUpdate, ProgramState, StreamStartPayload } from "../../src/shared/types";
import { closeProjectionWindow, openProjectionWindow, setProgramState, forwardProgramFrame } from "./projectionService";

export const registerIpcHandlers = () => {
  setStreamStatusPublisher((payload) => {
    BrowserWindow.getAllWindows().forEach((window) => window.webContents.send(IpcChannels.streamStatus, payload));
  });

  ipcMain.handle(IpcChannels.listDisplays, async () => listDisplays());

  ipcMain.handle(IpcChannels.getSettings, () => getSettings());

  ipcMain.handle(IpcChannels.updateSettings, (_event, update: SettingsUpdate) => updateSettings(update));

  ipcMain.handle(IpcChannels.selectSaveDirectory, async () => {
    const window = BrowserWindow.getFocusedWindow();
    const result = await dialog.showOpenDialog(window ?? undefined, {
      properties: ["openDirectory", "createDirectory"]
    });
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle(IpcChannels.saveRecording, async (_event, payload: SaveRecordingPayload) => saveRecording(payload));

  ipcMain.handle(IpcChannels.openFolder, async (_event, filePath: string) => {
    if (typeof filePath !== "string") {
      return false;
    }
    shell.showItemInFolder(filePath);
    return true;
  });

  ipcMain.handle(IpcChannels.openProjection, async (_event, displayId?: string | null) => {
    await openProjectionWindow(displayId);
    return true;
  });

  ipcMain.handle(IpcChannels.closeProjection, async () => {
    await closeProjectionWindow();
    return true;
  });

  ipcMain.handle(IpcChannels.startStream, async (_event, payload: StreamStartPayload) => startStreaming(payload));

  ipcMain.handle(IpcChannels.stopStream, async () => stopStreaming());

  ipcMain.handle(IpcChannels.getStreamLogPath, async () => getStreamLogPath());

  ipcMain.handle(IpcChannels.getStreamingCapabilities, async () => getStreamingCapabilities());

  ipcMain.handle(IpcChannels.getStoredStreamKey, async () => getStreamKey());

  ipcMain.handle(IpcChannels.setStoredStreamKey, async (_event, payload: { streamKey: string }) => {
    if (!payload?.streamKey) {
      return false;
    }
    return setStreamKey(payload.streamKey);
  });

  ipcMain.handle(IpcChannels.clearStoredStreamKey, async () => clearStreamKey());

  ipcMain.on(IpcChannels.updateProgramState, (_event, state: ProgramState) => {
    if (state) {
      setProgramState(state);
    }
  });

  ipcMain.on(IpcChannels.programFrame, (_event, dataUrl: string) => {
    if (typeof dataUrl === "string" && dataUrl.length > 0) {
      forwardProgramFrame(dataUrl);
    }
  });

  ipcMain.on(IpcChannels.streamChunk, (_event, payload: Uint8Array) => {
    if (payload && payload.length > 0) {
      sendStreamChunk(payload);
    }
  });
};

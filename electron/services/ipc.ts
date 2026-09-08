import { ipcMain, dialog, shell, BrowserWindow, app } from "electron";
import fs from "fs/promises";
import path from "path";
import { pathToFileURL } from "url";
import { IpcChannels } from "../../src/shared/ipc";
import { listDisplays, listProjectionDisplays } from "./displayService";
import { getSettings, updateSettings } from "./settingsService";
import {
  appendRecordingChunk,
  beginRecording,
  cancelRecording,
  finishRecording,
  saveRecording
} from "./recordingService";
import {
  getStreamLogPath,
  getStreamLogContent,
  getStreamingCapabilities,
  sendStreamChunk,
  setStreamStatusPublisher,
  startStreaming,
  stopStreaming
} from "./streamingService";
import { clearStreamKey, getStreamKey, isEncryptionAvailable, setStreamKey } from "./streamKeyService";
import {
  ExportClipPayload,
  MultiviewAction,
  MultiviewPayload,
  RecordingChunkPayload,
  RecordingSessionPayload,
  SaveRecordingPayload,
  SettingsUpdate,
  ProgramState,
  StreamStartPayload,
  StreamingCredentialInput,
  StreamingCredentialProvider
} from "../../src/shared/types";
import {
  closeLowerThirdWindow,
  closeProjectionWindows,
  forwardLowerThirdFrame,
  forwardProgramFrame,
  openLowerThirdWindow,
  openProjectionWindows,
  setProgramState
} from "./projectionService";
import { getProgramState } from "./projectionService";
import { createBrowserSource, destroyBrowserSource, updateBrowserSource } from "./browserSourceService";
import {
  getNetworkOutputStatus,
  setRemoteActionPublisher,
  startNetworkOutput,
  stopNetworkOutput,
  updateNetworkProgramFrame
} from "./networkOutputService";
import { exportClip } from "./editorService";
import { checkForUpdates, downloadUpdate, getUpdateStatus, installUpdate } from "./updateService";
import {
  closeMultiviewWindow,
  forwardMultiviewAction,
  forwardMultiviewData,
  openMultiviewWindow
} from "./multiviewService";
import {
  downloadScriptureLibrary,
  fetchScripture,
  importScriptureLibrary,
  getScriptureLibraryCatalog,
  listScriptureLibraries,
  lookupScriptureLibrary,
  removeScriptureLibrary,
  saveScripturePassage
} from "./scriptureService";
import { downloadSong, importSong, listSongs, removeSong } from "./songService";
import { authorizeStreaming } from "./streamingAuthService";
import {
  clearStreamingCredentials,
  disconnectStreamingAccount,
  getStreamingCredentialStatus,
  setStreamingCredentials
} from "./streamingCredentialService";

export const registerIpcHandlers = () => {
  ipcMain.handle(IpcChannels.getProgramState, () => getProgramState());
  setStreamStatusPublisher((payload) => {
    BrowserWindow.getAllWindows().forEach((window) => window.webContents.send(IpcChannels.streamStatus, payload));
  });

  ipcMain.handle(IpcChannels.listDisplays, async () => listDisplays());
  ipcMain.handle(IpcChannels.listProjectionDisplays, () => listProjectionDisplays());

  ipcMain.handle(IpcChannels.getSettings, () => getSettings());

  ipcMain.handle(IpcChannels.updateSettings, (_event, update: SettingsUpdate) => updateSettings(update));

  ipcMain.handle(IpcChannels.selectSaveDirectory, async () => {
    const window = BrowserWindow.getFocusedWindow();
    const options: Electron.OpenDialogOptions = {
      properties: ["openDirectory", "createDirectory"]
    };
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    return result.filePaths[0];
  });

  ipcMain.handle(IpcChannels.saveRecording, async (_event, payload: SaveRecordingPayload) => saveRecording(payload));
  ipcMain.handle(IpcChannels.beginRecording, async () => beginRecording());
  ipcMain.handle(IpcChannels.appendRecordingChunk, async (_event, payload: RecordingChunkPayload) => appendRecordingChunk(payload));
  ipcMain.handle(IpcChannels.finishRecording, async (_event, payload: RecordingSessionPayload) => finishRecording(payload));
  ipcMain.handle(IpcChannels.cancelRecording, async (_event, payload: RecordingSessionPayload) => cancelRecording(payload));

  ipcMain.handle(IpcChannels.selectMediaFile, async (_event, payload: { kind: "image" | "video" | "audio" }) => {
    const window = BrowserWindow.getFocusedWindow();
    const filters = payload?.kind
      ? [
          payload.kind === "image"
            ? { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp"] }
            : payload.kind === "video"
              ? { name: "Video", extensions: ["mp4", "webm", "mov", "mkv", "avi"] }
              : { name: "Audio", extensions: ["mp3", "wav", "ogg", "aac", "m4a"] }
        ]
      : [];
    const options: Electron.OpenDialogOptions = {
      properties: ["openFile"],
      filters
    };
    const result = window
      ? await dialog.showOpenDialog(window, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }
    const filePath = result.filePaths[0];
    const fileUrl = pathToFileURL(filePath).toString();
    return { filePath, fileUrl, name: filePath.split(/[\\/]/).pop() ?? "Media" };
  });
  setRemoteActionPublisher((action) => {
    BrowserWindow.getAllWindows().forEach((window) => window.webContents.send(IpcChannels.remoteOperatorAction, action));
  });

  ipcMain.handle(IpcChannels.openFolder, async (_event, filePath: string) => {
    if (typeof filePath !== "string") {
      return false;
    }
    shell.showItemInFolder(filePath);
    return true;
  });

  ipcMain.handle(IpcChannels.openProjection, async (_event, displayIds?: string[] | string | null) => {
    const targets = Array.isArray(displayIds) ? displayIds : displayIds ? [displayIds] : [];
    await openProjectionWindows(targets);
    return true;
  });

  ipcMain.handle(IpcChannels.closeProjection, async () => {
    await closeProjectionWindows();
    return true;
  });

  ipcMain.handle(IpcChannels.openLowerThird, async (_event, displayId: string) => {
    await openLowerThirdWindow(displayId);
    return true;
  });

  ipcMain.handle(IpcChannels.closeLowerThird, async () => {
    await closeLowerThirdWindow();
    return true;
  });

  ipcMain.handle(IpcChannels.openMultiview, async () => openMultiviewWindow());
  ipcMain.handle(IpcChannels.closeMultiview, async () => closeMultiviewWindow());
  ipcMain.handle(IpcChannels.getUpdateStatus, () => getUpdateStatus());
  ipcMain.handle(IpcChannels.checkForUpdates, async () => checkForUpdates());
  ipcMain.handle(IpcChannels.downloadUpdate, async () => downloadUpdate());
  ipcMain.handle(IpcChannels.installUpdate, () => installUpdate());
  ipcMain.handle(IpcChannels.openReleasePage, async () => {
    await shell.openExternal("https://github.com/WealthGate/DualCast-Studio/releases/latest");
    return true;
  });

  ipcMain.handle(IpcChannels.createBrowserSource, async (_event, payload) => createBrowserSource(payload));
  ipcMain.handle(IpcChannels.updateBrowserSource, async (_event, payload) => updateBrowserSource(payload));
  ipcMain.handle(IpcChannels.destroyBrowserSource, async (_event, payload) => destroyBrowserSource(payload));
  ipcMain.handle(IpcChannels.fetchScripture, async (_event, payload) => fetchScripture(payload));
  ipcMain.handle(IpcChannels.listScriptureLibraries, async () => listScriptureLibraries());
  ipcMain.handle(IpcChannels.lookupScriptureLibrary, async (_event, payload) => lookupScriptureLibrary(payload));
  ipcMain.handle(IpcChannels.importScriptureLibrary, async () => {
    const owner = BrowserWindow.getFocusedWindow();
    const options: Electron.OpenDialogOptions = {
      properties: ["openFile"],
      filters: [{ name: "Scripture Library JSON", extensions: ["json"] }]
    };
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return null;
    return importScriptureLibrary(result.filePaths[0]);
  });
  ipcMain.handle(IpcChannels.downloadScriptureLibrary, async (_event, payload) => downloadScriptureLibrary(payload));
  ipcMain.handle(IpcChannels.saveScripturePassage, async (_event, payload) => saveScripturePassage(payload));
  ipcMain.handle(IpcChannels.removeScriptureLibrary, async (_event, payload) => removeScriptureLibrary(payload));
  ipcMain.handle(IpcChannels.getScriptureLibraryCatalog, async (_event, libraryId: string) => getScriptureLibraryCatalog(libraryId));
  ipcMain.handle(IpcChannels.listSongs, async () => listSongs());
  ipcMain.handle(IpcChannels.importSong, async () => {
    const owner = BrowserWindow.getFocusedWindow();
    const options: Electron.OpenDialogOptions = {
      properties: ["openFile"],
      filters: [{ name: "Song Lyrics", extensions: ["txt", "md", "json"] }]
    };
    const result = owner ? await dialog.showOpenDialog(owner, options) : await dialog.showOpenDialog(options);
    if (result.canceled || result.filePaths.length === 0) return null;
    return importSong(result.filePaths[0]);
  });
  ipcMain.handle(IpcChannels.downloadSong, async (_event, payload) => downloadSong(payload));
  ipcMain.handle(IpcChannels.removeSong, async (_event, payload) => removeSong(payload));
  ipcMain.handle(IpcChannels.authorizeStreaming, async (_event, payload) => authorizeStreaming(payload));
  ipcMain.handle(IpcChannels.getStreamingCredentialStatus, async (_event, provider: StreamingCredentialProvider) =>
    getStreamingCredentialStatus(provider)
  );
  ipcMain.handle(IpcChannels.setStreamingCredentials, async (_event, payload: StreamingCredentialInput) =>
    setStreamingCredentials(payload)
  );
  ipcMain.handle(IpcChannels.clearStreamingCredentials, async (_event, provider: StreamingCredentialProvider) =>
    clearStreamingCredentials(provider)
  );
  ipcMain.handle(IpcChannels.disconnectStreamingAccount, async (_event, provider: StreamingCredentialProvider) =>
    disconnectStreamingAccount(provider)
  );
  ipcMain.handle(IpcChannels.downloadUserGuide, async () => {
    const owner = BrowserWindow.getFocusedWindow();
    const options: Electron.SaveDialogOptions = {
      defaultPath: "OpenChurch-Broadcast-Studio-User-Guide.pdf",
      filters: [{ name: "PDF", extensions: ["pdf"] }]
    };
    const result = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return null;
    const source = path.join(app.getAppPath(), "assets", "OpenChurch-Broadcast-Studio-User-Guide.pdf");
    await fs.copyFile(source, result.filePath);
    return result.filePath;
  });

  ipcMain.handle(IpcChannels.startStream, async (_event, payload: StreamStartPayload) => startStreaming(payload));

  ipcMain.handle(IpcChannels.stopStream, async () => stopStreaming());

  ipcMain.handle(IpcChannels.getStreamLogPath, async () => getStreamLogPath());

  ipcMain.handle(IpcChannels.getStreamLogContent, async (_event, payload?: { maxLines?: number }) =>
    getStreamLogContent(payload)
  );

  ipcMain.handle(IpcChannels.getStreamingCapabilities, async () => ({
    ...getStreamingCapabilities(),
    secureStorageAvailable: isEncryptionAvailable()
  }));

  ipcMain.handle(IpcChannels.getStoredStreamKey, async (_event, payload?: { destinationId?: string }) =>
    getStreamKey(payload?.destinationId)
  );

  ipcMain.handle(
    IpcChannels.setStoredStreamKey,
    async (_event, payload: { destinationId?: string; streamKey: string }) => {
      if (!payload?.streamKey) {
        return false;
      }
      return setStreamKey(payload.streamKey, payload.destinationId);
    }
  );

  ipcMain.handle(IpcChannels.clearStoredStreamKey, async (_event, payload?: { destinationId?: string }) =>
    clearStreamKey(payload?.destinationId)
  );

  ipcMain.handle(IpcChannels.startNetworkOutput, async (_event, payload) => startNetworkOutput(payload));
  ipcMain.handle(IpcChannels.stopNetworkOutput, async () => stopNetworkOutput());
  ipcMain.handle(IpcChannels.getNetworkOutputStatus, async () => getNetworkOutputStatus());
  ipcMain.handle(IpcChannels.exportClip, async (_event, payload: ExportClipPayload) => exportClip(payload));

  ipcMain.on(IpcChannels.updateProgramState, (_event, state: ProgramState) => {
    if (state) {
      setProgramState(state);
    }
  });

  ipcMain.on(IpcChannels.programFrame, (_event, dataUrl: string) => {
    if (typeof dataUrl === "string" && dataUrl.length > 0) {
      forwardProgramFrame(dataUrl);
      updateNetworkProgramFrame(dataUrl);
    }
  });

  ipcMain.on(IpcChannels.lowerThirdFrame, (_event, dataUrl: string) => {
    if (typeof dataUrl === "string" && dataUrl.length > 0) {
      forwardLowerThirdFrame(dataUrl);
    }
  });

  ipcMain.on(IpcChannels.multiviewData, (_event, payload: MultiviewPayload) => {
    if (payload?.tiles) {
      forwardMultiviewData(payload);
    }
  });

  ipcMain.on(IpcChannels.multiviewAction, (_event, action: MultiviewAction) => {
    if (action?.sceneId && (action.action === "preview" || action.action === "program")) {
      forwardMultiviewAction(action);
    }
  });

  ipcMain.handle(IpcChannels.streamChunk, async (_event, payload: Uint8Array) => {
    if (payload && payload.length > 0) {
      await sendStreamChunk(payload);
    }
    return true;
  });
};

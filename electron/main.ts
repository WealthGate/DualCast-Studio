import { getSettings } from "./services/settingsService";
import { stopAllCursorFreeCaptures } from "./services/cursorFreeCaptureService";
import { configureGraphics } from "./services/hardwareService";
import { app, BrowserWindow, screen } from "electron";
import path from "path";
import { registerIpcHandlers } from "./services/ipc";
import { setupLogging } from "./services/logger";
import { configureHotkeys, registerHotkeys, unregisterHotkeys } from "./services/hotkeyService";
import { initializeUpdater, stopUpdater } from "./services/updateService";
import { cleanupRecordingSessions, cleanupStaleRecordingFiles } from "./services/recordingService";
import { forceStopStreaming } from "./services/streamingService";
import { cleanupEditorCommands } from "./services/editorService";
import { registerAudioPluginIpc, stopAudioPlugins } from "./services/audioPluginService";
import { installApplicationMenu } from "./services/menuService";
import { IpcChannels } from "../src/shared/ipc";
import { registerDisplayEscape } from "./services/displayEscapeService";
import { closeProjectionWindows, closeLowerThirdWindow, hasProjectionWindows } from "./services/projectionService";
import { closeMultiviewWindow, hasMultiviewWindow } from "./services/multiviewService";


const isDev = !app.isPackaged && Boolean(process.env.VITE_DEV_SERVER_URL);
if (isDev) {
  const devUserData = path.join(app.getPath("appData"), "OpenChurch Broadcast Studio Dev");
  app.setPath("userData", devUserData);
  app.setPath("cache", path.join(devUserData, "Cache"));
} else {
  app.setPath("userData", path.join(app.getPath("appData"), "DualCast Studio"));
}
configureGraphics(getSettings().graphicsMode);

let mainWindow: BrowserWindow | null = null;
app.on("browser-window-created", (_event, window) => {
  registerDisplayEscape(window, () => {
    if (!hasProjectionWindows() && !hasMultiviewWindow()) return false;
    void closeProjectionWindows();
    void closeLowerThirdWindow();
    closeMultiviewWindow();
    return true;
  }, () => mainWindow);
});
const hasSingleInstanceLock = app.requestSingleInstanceLock();

const createMainWindow = () => {
  mainWindow = new BrowserWindow({
    title: `OpenChurch Broadcast Studio v${app.getVersion()}`,
    width: 1400,
    height: 900,
    minWidth: 640,
    minHeight: 480,
    backgroundColor: "#0b0f14",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
      backgroundThrottling: false
    }
  });

  const devServerUrl = isDev ? process.env.VITE_DEV_SERVER_URL : null;
  if (devServerUrl) {
    mainWindow.loadURL(devServerUrl);
    mainWindow.webContents.openDevTools({ mode: "detach" });
  } else {
    mainWindow.loadFile(path.join(__dirname, "../dist/renderer/index.html"));
  }

  mainWindow.once("ready-to-show", () => mainWindow?.show());
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
};

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow && !mainWindow.isDestroyed()) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.show();
      mainWindow.focus();
    }
  });

  app.whenReady().then(async () => {
    setupLogging();
    await cleanupStaleRecordingFiles();
    createMainWindow();
    installApplicationMenu(() => mainWindow);
    registerIpcHandlers();
    if (mainWindow) registerAudioPluginIpc(mainWindow.webContents);
    const notifyProjectionDisplaysChanged = () => {
      BrowserWindow.getAllWindows().forEach((window) => {
        if (!window.isDestroyed()) window.webContents.send(IpcChannels.projectionDisplaysChanged);
      });
    };
    screen.on("display-added", notifyProjectionDisplaysChanged);
    screen.on("display-removed", notifyProjectionDisplaysChanged);
    screen.on("display-metrics-changed", notifyProjectionDisplaysChanged);
    try {
      registerHotkeys(() => mainWindow);
      configureHotkeys(getSettings().hotkeys);
    } catch (error) { console.warn(error); }
    initializeUpdater();

    app.on("activate", () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createMainWindow();
      }
    });
  });
}

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  stopAudioPlugins();
  stopAllCursorFreeCaptures();
  unregisterHotkeys();
  stopUpdater();
  forceStopStreaming();
  cleanupRecordingSessions();
  cleanupEditorCommands();
});

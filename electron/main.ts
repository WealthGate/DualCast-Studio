import { app, BrowserWindow } from "electron";
import path from "path";
import { registerIpcHandlers } from "./services/ipc";
import { setupLogging } from "./services/logger";
import { registerHotkeys, unregisterHotkeys } from "./services/hotkeyService";
import { initializeUpdater, stopUpdater } from "./services/updateService";


const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);
if (isDev) {
  const devUserData = path.join(app.getPath("appData"), "OpenChurch Broadcast Studio Dev");
  app.setPath("userData", devUserData);
  app.setPath("cache", path.join(devUserData, "Cache"));
} else {
  app.setPath("userData", path.join(app.getPath("appData"), "DualCast Studio"));
}

let mainWindow: BrowserWindow | null = null;

const createMainWindow = () => {
  mainWindow = new BrowserWindow({
    title: `OpenChurch Broadcast Studio v${app.getVersion()}`,
    width: 1400,
    height: 900,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#0b0f14",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
      backgroundThrottling: false
    }
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
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

app.whenReady().then(() => {
  setupLogging();
  createMainWindow();
  registerIpcHandlers();
  registerHotkeys(() => mainWindow);
  initializeUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("will-quit", () => {
  unregisterHotkeys();
  stopUpdater();
});

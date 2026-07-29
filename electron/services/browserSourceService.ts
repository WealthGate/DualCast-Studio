import { BrowserWindow } from "electron";
import { IpcChannels } from "../../src/shared/ipc";
import { BrowserFramePayload, BrowserSourcePayload } from "../../src/shared/types";
import log from "./logger";

type BrowserSourceEntry = {
  window: BrowserWindow;
  timer: NodeJS.Timeout | null;
  url: string;
};

const sources = new Map<string, BrowserSourceEntry>();
const captureFps = 10;

const broadcastFrame = (payload: BrowserFramePayload) => {
  BrowserWindow.getAllWindows().forEach((window) => {
    window.webContents.send(IpcChannels.browserFrame, payload);
  });
};

const startCapture = (sourceId: string, entry: BrowserSourceEntry) => {
  if (entry.timer) {
    return;
  }
  entry.timer = setInterval(async () => {
    if (entry.window.isDestroyed()) {
      return;
    }
    try {
      const image = await entry.window.webContents.capturePage();
      broadcastFrame({ sourceId, dataUrl: image.toDataURL() });
    } catch (error) {
      log.warn("Browser source capture failed.", error);
    }
  }, 1000 / captureFps);
};

const stopCapture = (entry: BrowserSourceEntry) => {
  if (entry.timer) {
    clearInterval(entry.timer);
    entry.timer = null;
  }
};

const createWindow = (payload: BrowserSourcePayload) => {
  const window = new BrowserWindow({
    show: false,
    width: Math.max(1, payload.width),
    height: Math.max(1, payload.height),
    backgroundColor: "#000000",
    webPreferences: {
      offscreen: true,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  });

  window.webContents.setFrameRate(30);
  window.webContents.setAudioMuted(true);
  window.webContents.loadURL(payload.url).catch((error) => {
    log.warn("Browser source failed to load URL.", error);
  });

  return window;
};

export const createBrowserSource = async (payload: BrowserSourcePayload) => {
  if (!payload?.sourceId || !payload.url) {
    return false;
  }

  const existing = sources.get(payload.sourceId);
  if (existing && !existing.window.isDestroyed()) {
    existing.url = payload.url;
    existing.window.setSize(Math.max(1, payload.width), Math.max(1, payload.height));
    existing.window.webContents.loadURL(payload.url).catch((error) => {
      log.warn("Browser source failed to reload URL.", error);
    });
    startCapture(payload.sourceId, existing);
    return true;
  }

  const window = createWindow(payload);
  const entry: BrowserSourceEntry = { window, timer: null, url: payload.url };
  sources.set(payload.sourceId, entry);
  startCapture(payload.sourceId, entry);

  window.on("closed", () => {
    stopCapture(entry);
    sources.delete(payload.sourceId);
  });

  return true;
};

export const updateBrowserSource = async (payload: BrowserSourcePayload) => {
  if (!payload?.sourceId) {
    return false;
  }
  const entry = sources.get(payload.sourceId);
  if (!entry || entry.window.isDestroyed()) {
    return createBrowserSource(payload);
  }

  entry.window.setSize(Math.max(1, payload.width), Math.max(1, payload.height));
  if (payload.url && payload.url !== entry.url) {
    entry.url = payload.url;
    entry.window.webContents.loadURL(payload.url).catch((error) => {
      log.warn("Browser source failed to update URL.", error);
    });
  }

  startCapture(payload.sourceId, entry);
  return true;
};

export const destroyBrowserSource = async (payload: { sourceId: string }) => {
  const entry = sources.get(payload.sourceId);
  if (!entry) {
    return false;
  }
  stopCapture(entry);
  if (!entry.window.isDestroyed()) {
    entry.window.destroy();
  }
  sources.delete(payload.sourceId);
  return true;
};

import { sendToWindow } from "./safeSend";
import { BrowserWindow } from "electron";
import { IpcChannels } from "../../src/shared/ipc";
import { BrowserFramePayload, BrowserSourcePayload } from "../../src/shared/types";
import log from "./logger";

type BrowserSourceEntry = {
  window: BrowserWindow;
  url: string;
  navigation: number;
  ready: boolean;
};

const sources = new Map<string, BrowserSourceEntry>();

const broadcastFrame = (payload: BrowserFramePayload) => {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed() && !window.webContents.isDestroyed() && !Array.from(sources.values()).some(entry => entry.window === window) && !/[?&](projection|multiview)=/.test(window.webContents.getURL())) {
      sendToWindow(window, IpcChannels.browserFrame, payload);
    }
  });
};

const normalizePayload = (payload: BrowserSourcePayload): BrowserSourcePayload | null => {
  if (!payload || typeof payload.sourceId !== "string" || !/^[a-z0-9:._-]{1,200}$/i.test(payload.sourceId)) {
    return null;
  }
  try {
    const url = new URL(payload.url);
    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return null;
    }
    const width = Number(payload.width);
    const height = Number(payload.height);
    if (!Number.isFinite(width) || !Number.isFinite(height)) {
      return null;
    }
    return {
      sourceId: payload.sourceId,
      url: url.toString(),
      width: Math.max(1, Math.min(4096, Math.round(width))),
      height: Math.max(1, Math.min(4096, Math.round(height))),
      frameRate: Number.isFinite(payload.frameRate) ? Math.max(1, Math.min(60, Math.round(payload.frameRate!))) : 30
    };
  } catch {
    return null;
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

  const entry: BrowserSourceEntry = { window, url: payload.url, navigation: 0, ready: false };
  window.webContents.setFrameRate(payload.frameRate ?? 30);
  window.webContents.on("paint", (_event, _rect, image) => {
    if (entry.ready && !window.isDestroyed()) broadcastFrame({ sourceId: payload.sourceId, dataUrl: `data:image/jpeg;base64,${image.toJPEG(85).toString("base64")}` });
  });
  window.webContents.setAudioMuted(true);
  return entry;
};

const navigate = async (entry: BrowserSourceEntry, url: string) => {
  const navigation = ++entry.navigation;
  entry.ready = false;
  entry.url = url;
  try {
    await entry.window.webContents.loadURL(url);
    if (entry.navigation !== navigation || entry.window.isDestroyed()) return false;
    entry.ready = true;
    entry.window.webContents.invalidate();
    return true;
  } catch (error) {
    if (entry.navigation === navigation && !entry.window.isDestroyed()) log.warn("Browser source failed to load URL.", error);
    return false;
  }
};

export const createBrowserSource = async (payload: BrowserSourcePayload) => {
  const normalized = normalizePayload(payload);
  if (!normalized) {
    return false;
  }
  payload = normalized;

  const existing = sources.get(payload.sourceId);
  if (existing && !existing.window.isDestroyed()) {
    existing.window.setSize(Math.max(1, payload.width), Math.max(1, payload.height));
    existing.window.webContents.setFrameRate(payload.frameRate ?? 30);
    return navigate(existing, payload.url);
  }

  const entry = createWindow(payload);
  sources.set(payload.sourceId, entry);
  entry.window.on("closed", () => {
    if (sources.get(payload.sourceId) === entry) sources.delete(payload.sourceId);
  });
  return navigate(entry, payload.url);
};

export const updateBrowserSource = async (payload: BrowserSourcePayload) => {
  const normalized = normalizePayload(payload);
  if (!normalized) {
    return false;
  }
  payload = normalized;
  const entry = sources.get(payload.sourceId);
  if (!entry || entry.window.isDestroyed()) {
    return createBrowserSource(payload);
  }

  entry.window.setSize(Math.max(1, payload.width), Math.max(1, payload.height));
  entry.window.webContents.setFrameRate(payload.frameRate ?? 30);
  return payload.url !== entry.url ? navigate(entry, payload.url) : true;
};

export const destroyBrowserSource = async (payload: { sourceId: string }) => {
  const entry = sources.get(payload.sourceId);
  if (!entry) {
    return false;
  }
  if (!entry.window.isDestroyed()) {
    entry.window.destroy();
  }
  sources.delete(payload.sourceId);
  return true;
};

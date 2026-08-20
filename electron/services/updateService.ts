import { app, BrowserWindow } from "electron";
import { autoUpdater } from "electron-updater";
import { IpcChannels } from "../../src/shared/ipc";
import { UpdateStatusPayload } from "../../src/shared/types";

let status: UpdateStatusPayload = {
  state: "idle",
  currentVersion: app.getVersion(),
  latestVersion: null,
  progressPercent: null,
  message: null
};
let initialized = false;
let updateInterval: NodeJS.Timeout | null = null;
let initialCheckTimeout: NodeJS.Timeout | null = null;
let checkPromise: Promise<UpdateStatusPayload> | null = null;

const normalizeVersion = (version?: string | null) => version?.trim().replace(/^v/i, "") || null;

const publishStatus = (update: Partial<UpdateStatusPayload>) => {
  status = {
    ...status,
    ...update,
    currentVersion: normalizeVersion(app.getVersion()) ?? app.getVersion(),
    latestVersion: update.latestVersion === undefined
      ? status.latestVersion
      : normalizeVersion(update.latestVersion)
  };
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send(IpcChannels.updateStatus, status);
    }
  });
};

export const getUpdateStatus = () => status;

export const checkForUpdates = async () => {
  if (!app.isPackaged) {
    publishStatus({ state: "idle", message: "Update checks run in the installed desktop app." });
    return status;
  }
  if (checkPromise) {
    return checkPromise;
  }

  checkPromise = (async () => {
    publishStatus({ state: "checking", progressPercent: null, message: `Installed version: v${app.getVersion()}.` });
    try {
      await autoUpdater.checkForUpdates();
    } catch (error) {
      publishStatus({
        state: "error",
        message: error instanceof Error ? error.message : "Unable to check for updates."
      });
    }
    return status;
  })();
  try {
    return await checkPromise;
  } finally {
    checkPromise = null;
  }
};

export const downloadUpdate = async () => {
  if (!app.isPackaged || status.state !== "available") {
    return false;
  }
  try {
    publishStatus({ state: "downloading", progressPercent: 0, message: null });
    await autoUpdater.downloadUpdate();
    return true;
  } catch (error) {
    publishStatus({
      state: "error",
      message: error instanceof Error ? error.message : "Unable to download the update."
    });
    return false;
  }
};

export const installUpdate = () => {
  if (!app.isPackaged || status.state !== "downloaded") {
    return false;
  }
  autoUpdater.quitAndInstall(false, true);
  return true;
};

export const initializeUpdater = () => {
  if (initialized) {
    return;
  }
  initialized = true;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.allowPrerelease = false;
  autoUpdater.requestHeaders = { "Cache-Control": "no-cache" };

  autoUpdater.on("checking-for-update", () => publishStatus({ state: "checking", message: null }));
  autoUpdater.on("update-available", (info) => publishStatus({
    state: "available",
    latestVersion: info.version,
    progressPercent: null,
    message: `Version ${info.version} is ready to download.`
  }));
  autoUpdater.on("update-not-available", (info) => publishStatus({
    state: "up-to-date",
    latestVersion: info.version,
    progressPercent: null,
    message: `Version ${app.getVersion()} is current.`
  }));
  autoUpdater.on("download-progress", (progress) => publishStatus({
    state: "downloading",
    progressPercent: Math.max(0, Math.min(100, progress.percent)),
    message: `Downloading version ${status.latestVersion ?? "update"}.`
  }));
  autoUpdater.on("update-downloaded", (info) => publishStatus({
    state: "downloaded",
    latestVersion: info.version,
    progressPercent: 100,
    message: `Version ${info.version} is ready to install.`
  }));
  autoUpdater.on("error", (error) => publishStatus({
    state: "error",
    message: error.message || "The update service encountered an error."
  }));

  if (app.isPackaged) {
    initialCheckTimeout = setTimeout(() => {
      initialCheckTimeout = null;
      void checkForUpdates();
    }, 12_000);
    updateInterval = setInterval(() => void checkForUpdates(), 4 * 60 * 60 * 1000);
  }
};

export const stopUpdater = () => {
  if (initialCheckTimeout) {
    clearTimeout(initialCheckTimeout);
    initialCheckTimeout = null;
  }
  if (updateInterval) {
    clearInterval(updateInterval);
    updateInterval = null;
  }
};

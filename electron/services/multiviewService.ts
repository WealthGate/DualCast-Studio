import { BrowserWindow } from "electron";
import path from "path";
import { IpcChannels } from "../../src/shared/ipc";
import { MultiviewAction, MultiviewPayload } from "../../src/shared/types";

let multiviewWindow: BrowserWindow | null = null;
let lastPayload: MultiviewPayload | null = null;

const notifyStudioWindows = (channel: string, payload?: unknown) => {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (window !== multiviewWindow && !window.isDestroyed()) {
      window.webContents.send(channel, payload);
    }
  });
};

export const openMultiviewWindow = async () => {
  if (multiviewWindow && !multiviewWindow.isDestroyed()) {
    multiviewWindow.show();
    multiviewWindow.focus();
    notifyStudioWindows(IpcChannels.multiviewOpened);
    return true;
  }

  multiviewWindow = new BrowserWindow({
    title: "OpenChurch Multiview",
    width: 1280,
    height: 760,
    minWidth: 800,
    minHeight: 520,
    backgroundColor: "#0d0f14",
    show: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
      backgroundThrottling: false
    }
  });

  multiviewWindow.once("ready-to-show", () => multiviewWindow?.show());
  multiviewWindow.webContents.on("did-finish-load", () => {
    if (lastPayload && multiviewWindow && !multiviewWindow.isDestroyed()) {
      multiviewWindow.webContents.send(IpcChannels.multiviewData, lastPayload);
    }
    notifyStudioWindows(IpcChannels.multiviewOpened);
  });
  multiviewWindow.on("closed", () => {
    multiviewWindow = null;
    notifyStudioWindows(IpcChannels.multiviewClosed);
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    await multiviewWindow.loadURL(`${devServerUrl}?multiview=1`);
  } else {
    await multiviewWindow.loadFile(path.join(__dirname, "../dist/renderer/index.html"), {
      query: { multiview: "1" }
    });
  }

  return true;
};

export const closeMultiviewWindow = () => {
  if (multiviewWindow && !multiviewWindow.isDestroyed()) {
    multiviewWindow.close();
  }
  return true;
};

export const forwardMultiviewData = (payload: MultiviewPayload) => {
  lastPayload = payload;
  if (multiviewWindow && !multiviewWindow.isDestroyed()) {
    multiviewWindow.webContents.send(IpcChannels.multiviewData, payload);
  }
};

export const forwardMultiviewAction = (action: MultiviewAction) => {
  notifyStudioWindows(IpcChannels.multiviewAction, action);
};

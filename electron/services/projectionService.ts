import { BrowserWindow, screen } from "electron";
import path from "path";
import { ProgramState } from "../../src/shared/types";
import { IpcChannels } from "../../src/shared/ipc";

let projectionWindow: BrowserWindow | null = null;
let lastProgramState: ProgramState | null = null;

const getDisplayBounds = (displayId?: string | null) => {
  if (displayId) {
    const target = screen.getAllDisplays().find((display) => String(display.id) === String(displayId));
    if (target) {
      return target.bounds;
    }
  }
  return screen.getPrimaryDisplay().bounds;
};

const buildProjectionUrl = () => {
  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    return `${devServerUrl}?projection=1`;
  }
  return null;
};

const applyBounds = (window: BrowserWindow, displayId?: string | null) => {
  const bounds = getDisplayBounds(displayId);
  window.setBounds(bounds);
};

export const openProjectionWindow = async (displayId?: string | null) => {
  if (projectionWindow && !projectionWindow.isDestroyed()) {
    applyBounds(projectionWindow, displayId);
    projectionWindow.show();
    projectionWindow.focus();
    return;
  }

  projectionWindow = new BrowserWindow({
    show: false,
    frame: false,
    backgroundColor: "#000000",
    skipTaskbar: true,
    fullscreenable: false,
    alwaysOnTop: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js")
    }
  });

  applyBounds(projectionWindow, displayId);

  const devUrl = buildProjectionUrl();
  if (devUrl) {
    await projectionWindow.loadURL(devUrl);
  } else {
    await projectionWindow.loadFile(path.join(__dirname, "../renderer/index.html"), {
      query: { projection: "1" }
    });
  }

  projectionWindow.once("ready-to-show", () => projectionWindow?.show());
  projectionWindow.on("closed", () => {
    notifyProjectionClosed();
    projectionWindow = null;
  });
  projectionWindow.webContents.on("did-finish-load", () => {
    if (lastProgramState) {
      projectionWindow?.webContents.send(IpcChannels.programState, lastProgramState);
    }
    notifyProjectionOpened();
  });
};

export const closeProjectionWindow = async () => {
  if (!projectionWindow || projectionWindow.isDestroyed()) {
    return;
  }
  projectionWindow.close();
};

export const setProgramState = (state: ProgramState) => {
  lastProgramState = state;
  if (projectionWindow && !projectionWindow.isDestroyed()) {
    projectionWindow.webContents.send(IpcChannels.programState, state);
  }
};

export const forwardProgramFrame = (dataUrl: string) => {
  if (projectionWindow && !projectionWindow.isDestroyed()) {
    projectionWindow.webContents.send(IpcChannels.programFrame, dataUrl);
  }
};

export const notifyProjectionOpened = () => {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (window !== projectionWindow) {
      window.webContents.send(IpcChannels.projectionOpened);
    }
  });
};

export const notifyProjectionClosed = () => {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (window !== projectionWindow) {
      window.webContents.send(IpcChannels.projectionClosed);
    }
  });
};

import { app, BrowserWindow, screen } from "electron";
import path from "path";
import { ProgramState } from "../../src/shared/types";
import { IpcChannels } from "../../src/shared/ipc";

const programWindows = new Map<string, BrowserWindow>();
const lowerThirdWindows = new Map<string, BrowserWindow>();
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

const buildProjectionUrl = (mode: "program" | "lower-third") => {
  const devServerUrl = app.isPackaged ? null : process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    return `${devServerUrl}?projection=${mode}`;
  }
  return null;
};

const isOutputWindow = (window: BrowserWindow) =>
  Array.from(programWindows.values()).includes(window) || Array.from(lowerThirdWindows.values()).includes(window);

const notifyMainWindows = (channel: string) => {
  BrowserWindow.getAllWindows().forEach((window) => {
    if (!isOutputWindow(window)) {
      window.webContents.send(channel);
    }
  });
};

const createOutputWindow = async (
  displayId: string,
  mode: "program" | "lower-third",
  collection: Map<string, BrowserWindow>
) => {
  const existing = collection.get(displayId);
  if (existing && !existing.isDestroyed()) {
    existing.setBounds(getDisplayBounds(displayId));
    existing.show();
    return existing;
  }

  const outputWindow = new BrowserWindow({
    show: false,
    frame: false,
    backgroundColor: mode === "lower-third" ? "#00000000" : "#000000",
    transparent: mode === "lower-third",
    skipTaskbar: true,
    fullscreenable: false,
    alwaysOnTop: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(__dirname, "preload.js"),
      backgroundThrottling: false
    }
  });

  collection.set(displayId, outputWindow);
  outputWindow.setBounds(getDisplayBounds(displayId));

  const devUrl = buildProjectionUrl(mode);
  const loadFile = () =>
    outputWindow.loadFile(path.join(__dirname, "../dist/renderer/index.html"), {
      query: { projection: mode }
    });

  if (devUrl) {
    try {
      await outputWindow.loadURL(devUrl);
    } catch {
      await loadFile();
    }
  } else {
    await loadFile();
  }

  outputWindow.once("ready-to-show", () => outputWindow.show());
  outputWindow.on("closed", () => {
    collection.delete(displayId);
    if (collection.size === 0) {
      notifyMainWindows(mode === "program" ? IpcChannels.projectionClosed : IpcChannels.lowerThirdClosed);
    }
  });
  outputWindow.webContents.on("did-finish-load", () => {
    if (lastProgramState) {
      outputWindow.webContents.send(IpcChannels.programState, lastProgramState);
    }
    notifyMainWindows(mode === "program" ? IpcChannels.projectionOpened : IpcChannels.lowerThirdOpened);
  });

  return outputWindow;
};

export const openProjectionWindows = async (displayIds: string[]) => {
  const targets = Array.from(new Set(displayIds.filter(Boolean)));
  await Promise.all(targets.map((displayId) => createOutputWindow(displayId, "program", programWindows)));

  Array.from(programWindows.entries()).forEach(([displayId, window]) => {
    if (!targets.includes(displayId) && !window.isDestroyed()) {
      window.close();
    }
  });
};

export const closeProjectionWindows = async () => {
  Array.from(programWindows.values()).forEach((window) => {
    if (!window.isDestroyed()) {
      window.close();
    }
  });
};

export const openLowerThirdWindow = async (displayId: string) => {
  Array.from(lowerThirdWindows.entries()).forEach(([currentId, window]) => {
    if (currentId !== displayId && !window.isDestroyed()) {
      window.close();
    }
  });
  await createOutputWindow(displayId, "lower-third", lowerThirdWindows);
};

export const closeLowerThirdWindow = async () => {
  Array.from(lowerThirdWindows.values()).forEach((window) => {
    if (!window.isDestroyed()) {
      window.close();
    }
  });
};

export const setProgramState = (state: ProgramState) => {
  lastProgramState = state;
  [...programWindows.values(), ...lowerThirdWindows.values()].forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send(IpcChannels.programState, state);
    }
  });
};

export const forwardProgramFrame = (dataUrl: string) => {
  programWindows.forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send(IpcChannels.programFrame, dataUrl);
    }
  });
};

export const forwardLowerThirdFrame = (dataUrl: string) => {
  lowerThirdWindows.forEach((window) => {
    if (!window.isDestroyed()) {
      window.webContents.send(IpcChannels.lowerThirdFrame, dataUrl);
    }
  });
};

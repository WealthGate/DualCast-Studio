import { app, BrowserWindow, screen } from "electron";
import path from "path";
import { ProgramState, ProjectionSignal } from "../../src/shared/types";
import { IpcChannels } from "../../src/shared/ipc";
import { createLatestFrameRelay } from "./latestFrameRelay";

const programWindows = new Map<string, BrowserWindow>();
const lowerThirdWindows = new Map<string, BrowserWindow>();
let lastProgramState: ProgramState | null = null;
const relays = new Map<number, ReturnType<typeof createLatestFrameRelay>>();
let videoProducer: Electron.WebContents | null = null;
export const routeProjectionSignal = (sender: Electron.WebContents, signal: ProjectionSignal) => {
  if (!signal || typeof signal !== "object") return;
  const outputs = Array.from(programWindows.values()).filter(window => !window.isDestroyed());
  const output = outputs.find(window => window.webContents.id === sender.id);
  if (signal.type === "register" && !output) {
    const window = BrowserWindow.fromWebContents(sender);
    if (!window || isOutputWindow(window) || /[?&](multiview|projection)=/.test(sender.getURL())) return;
    videoProducer = sender;
    outputs.forEach(window => sender.send(IpcChannels.projectionSignal, { type: "ready", peerId: window.webContents.id }));
  } else if (sender === videoProducer) {
    const target = outputs.find(window => window.webContents.id === signal.peerId);
    if (target && ["offer", "candidate"].includes(signal.type)) target.webContents.send(IpcChannels.projectionSignal, signal);
  } else if (output && videoProducer && !videoProducer.isDestroyed() && ["ready", "answer", "candidate", "closed"].includes(signal.type)) {
    videoProducer.send(IpcChannels.projectionSignal, { ...signal, peerId: sender.id });
  }
};
export const acknowledgeProjectionFrame = (senderId: number, sequence: number) => relays.get(senderId)?.acknowledge(sequence);
export const hasProjectionWindows = () =>
  [...programWindows.values(), ...lowerThirdWindows.values()].some((window) => !window.isDestroyed());
export const getProgramState = () => lastProgramState;

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
  relays.set(outputWindow.webContents.id, createLatestFrameRelay(payload => {
    if (!outputWindow.isDestroyed()) outputWindow.webContents.send(mode === "program" ? IpcChannels.programFrame : IpcChannels.lowerThirdFrame, payload);
  }));
  const contentsId = outputWindow.webContents.id;
  outputWindow.setBounds(getDisplayBounds(displayId));

  outputWindow.once("ready-to-show", () => outputWindow.show());
  outputWindow.on("closed", () => {
    if (mode === "program" && videoProducer && !videoProducer.isDestroyed()) videoProducer.send(IpcChannels.projectionSignal, { type: "closed", peerId: contentsId });
    relays.delete(contentsId);
    collection.delete(displayId);
    if (collection.size === 0) {
      notifyMainWindows(mode === "program" ? IpcChannels.projectionClosed : IpcChannels.lowerThirdClosed);
    }
  });

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

    if (lastProgramState) {
      outputWindow.webContents.send(IpcChannels.programState, lastProgramState);
    }
    notifyMainWindows(mode === "program" ? IpcChannels.projectionOpened : IpcChannels.lowerThirdOpened);
  outputWindow.show();

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
      if (lastProgramState?.sanctuary?.settings.mode !== "independent") relays.get(window.webContents.id)?.offer(dataUrl);
    }
  });
};

export const forwardLowerThirdFrame = (dataUrl: string) => {
  lowerThirdWindows.forEach((window) => {
    if (!window.isDestroyed()) {
      relays.get(window.webContents.id)?.offer(dataUrl);
    }
  });
};

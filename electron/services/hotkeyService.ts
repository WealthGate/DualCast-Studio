import { BrowserWindow, globalShortcut } from "electron";
import { IpcChannels } from "../../src/shared/ipc";
import { HotkeyAction } from "../../src/shared/types";

let registered = false;

const sendHotkey = (getWindow: () => BrowserWindow | null, action: HotkeyAction) => {
  const window = getWindow();
  if (!window || window.isDestroyed()) {
    return;
  }
  window.webContents.send(IpcChannels.hotkey, { action });
};

export const registerHotkeys = (getWindow: () => BrowserWindow | null) => {
  if (registered) {
    return;
  }
  registered = true;

  globalShortcut.register("CommandOrControl+Shift+R", () => sendHotkey(getWindow, "toggle-record"));
  globalShortcut.register("CommandOrControl+Enter", () => sendHotkey(getWindow, "take"));
  globalShortcut.register("CommandOrControl+B", () => sendHotkey(getWindow, "cut-black"));
};

export const unregisterHotkeys = () => {
  if (!registered) {
    return;
  }
  globalShortcut.unregisterAll();
  registered = false;
};

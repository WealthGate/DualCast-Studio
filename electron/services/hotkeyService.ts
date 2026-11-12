import { sendToWindow } from "./safeSend";
import { BrowserWindow, globalShortcut } from "electron";
import { IpcChannels } from "../../src/shared/ipc";
import { HotkeyAction } from "../../src/shared/types";

let registered = false;
let windowGetter: (() => BrowserWindow | null) | null = null;
export const defaultHotkeys = { "toggle-record": "CommandOrControl+Shift+R", take: "CommandOrControl+Enter", "cut-black": "CommandOrControl+B" };
let activeBindings = { ...defaultHotkeys };
export const configureHotkeys = (bindings = defaultHotkeys) => {
  globalShortcut.unregisterAll();
  if (!windowGetter) return;
  for (const [action, accelerator] of Object.entries(bindings)) {
    if (accelerator) {
      let success = false;
      try { success = globalShortcut.register(accelerator, () => sendHotkey(windowGetter!, action as HotkeyAction)); } catch { /* Report below. */ }
      if (!success) {
        globalShortcut.unregisterAll();
        for (const [previousAction, previousKey] of Object.entries(activeBindings)) {
          if (previousKey) globalShortcut.register(previousKey, () => sendHotkey(windowGetter!, previousAction as HotkeyAction));
        }
        throw new Error(`Hotkey ${accelerator} is invalid or already in use. Choose another shortcut.`);
      }
    }
  }
  activeBindings = { ...bindings };
};

const sendHotkey = (getWindow: () => BrowserWindow | null, action: HotkeyAction) => {
  const window = getWindow();
  if (!window || window.isDestroyed()) {
    return;
  }
  sendToWindow(window, IpcChannels.hotkey, { action });
};

export const registerHotkeys = (getWindow: () => BrowserWindow | null) => {
  if (registered) {
    return;
  }
  registered = true;

  windowGetter = getWindow;
  configureHotkeys();
};

export const unregisterHotkeys = () => {
  if (!registered) {
    return;
  }
  globalShortcut.unregisterAll();
  registered = false;
};

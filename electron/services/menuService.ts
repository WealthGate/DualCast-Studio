import { app, BrowserWindow, dialog, Menu, MenuItemConstructorOptions, shell } from "electron";
import fs from "fs";
import path from "path";
import { IpcChannels } from "../../src/shared/ipc";
import { AppCommand } from "../../src/shared/types";
import { getSettings } from "./settingsService";

const openDirectory = async (directoryPath: string) => {
  fs.mkdirSync(directoryPath, { recursive: true });
  const error = await shell.openPath(directoryPath);
  if (error) throw new Error(error);
};

const runMenuAction = (action: () => Promise<unknown>, actionLabel: string) => {
  void action().catch((error) => {
    const detail = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox(`${actionLabel} failed`, detail);
  });
};

export const installApplicationMenu = (getWindow: () => BrowserWindow | null) => {
  const send = (command: AppCommand) => {
    const window = getWindow();
    if (window && !window.isDestroyed()) window.webContents.send(IpcChannels.appCommand, command);
  };

  const template: MenuItemConstructorOptions[] = [
    {
      label: "File",
      submenu: [
        { label: "Open Recordings Folder", accelerator: "CmdOrCtrl+Shift+O", click: () => runMenuAction(() => openDirectory(getSettings().saveDirectory), "Opening the recordings folder") },
        { label: "Open Stream Logs Folder", click: () => runMenuAction(() => openDirectory(path.join(app.getPath("userData"), "logs")), "Opening the stream logs folder") },
        { label: "Open Scripture Libraries Folder", click: () => runMenuAction(() => openDirectory(path.join(app.getPath("userData"), "scripture-libraries")), "Opening the Scripture libraries folder") },
        { label: "Open Application Data Folder", click: () => runMenuAction(() => openDirectory(app.getPath("userData")), "Opening the application data folder") },
        { type: "separator" },
        { label: "Settings", accelerator: "CmdOrCtrl+,", click: () => send("open-settings") },
        { type: "separator" },
        process.platform === "darwin" ? { role: "close" } : { role: "quit", label: "Exit" }
      ]
    },
    {
      label: "Profile",
      submenu: [
        { label: "New from Current Settings…", click: () => send("profile-new") },
        { label: "Duplicate Active Profile…", click: () => send("profile-duplicate") },
        { type: "separator" },
        { label: "Manage Profiles…", click: () => send("profile-manage") }
      ]
    },
    {
      label: "View",
      submenu: [
        { label: "Toggle Studio Mode", accelerator: "CmdOrCtrl+Shift+S", click: () => send("toggle-studio") },
        { role: "togglefullscreen" },
        { type: "separator" },
        { role: "reload" },
        { role: "toggleDevTools", visible: !app.isPackaged }
      ]
    },
    {
      label: "Tools",
      submenu: [
        { label: "Stream Setup", click: () => send("open-stream-setup") },
        { label: "Auto-Configuration Wizard…", click: () => send("open-auto-config") },
        { label: "Settings", click: () => send("open-settings") }
      ]
    },
    {
      label: "Help",
      submenu: [
        { label: "OpenChurch Broadcast Studio Releases", click: () => runMenuAction(() => shell.openExternal("https://github.com/WealthGate/DualCast-Studio/releases/latest"), "Opening the releases page") },
        { role: "about" }
      ]
    }
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
};

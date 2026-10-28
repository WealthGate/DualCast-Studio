import { app } from "electron";
import fs from "fs";
import path from "path";

export const getWindowsCaptureExecutable = () => {
  const root = app.isPackaged ? process.resourcesPath : path.join(app.getAppPath(), "assets");
  const executable = path.join(root, "windows-capture", "ffmpeg.exe");
  return fs.existsSync(executable) ? executable : null;
};

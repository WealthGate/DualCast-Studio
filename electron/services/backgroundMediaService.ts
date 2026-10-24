import { app, BrowserWindow, dialog, ipcMain, WebContents } from "electron";
import Store from "electron-store";
import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { randomUUID } from "node:crypto";
import { BackgroundImportResult, BackgroundMedia } from "../../src/shared/backgrounds";
import { IpcChannels } from "../../src/shared/ipc";

type Entry = Omit<BackgroundMedia, "url" | "missing"> & { fileName: string };
let store: Store<{ items: Entry[] }> | null = null;
let studio: WebContents | null = null;
let registered = false, importing = false;
const library = () => store ??= new Store({ name: "background-media", defaults: { items: [] as Entry[] } });
const directory = () => path.join(app.getPath("userData"), "background-media");
const entries = () => library().get("items").filter(item => item && /^[a-f\d-]{36}$/i.test(item.id) && typeof item.fileName === "string" && path.basename(item.fileName) === item.fileName && (item.kind === "image" || item.kind === "video"));
export const listBackgroundMedia = (): BackgroundMedia[] => entries().map(({ fileName, ...item }) => {
  const file = path.join(directory(), fileName);
  return { ...item, url: pathToFileURL(file).toString(), missing: !existsSync(file) };
});
export const importBackgroundMedia = async (kind: "image" | "video", owner: WebContents): Promise<BackgroundImportResult> => {
  if (kind !== "image" && kind !== "video") throw Error("Choose images or videos.");
  if (importing) throw Error("Wait for the current background import to finish.");
  importing = true;
  try {
    const extensions = kind === "image" ? ["png", "jpg", "jpeg", "webp", "gif", "bmp"] : ["mp4", "webm", "mov", "mkv", "avi"];
    const options: Electron.OpenDialogOptions = { title: `Upload background ${kind === "image" ? "images" : "videos"}`, properties: ["openFile", "multiSelections"], filters: [{ name: kind === "image" ? "Images" : "Videos", extensions }] };
    const window = BrowserWindow.fromWebContents(owner);
    const selected = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
    if (selected.canceled) return { items: listBackgroundMedia(), errors: [] };
    await fs.mkdir(directory(), { recursive: true });
    const items = entries(), errors: string[] = [];
    for (const file of selected.filePaths) {
      if (items.length >= 256) { errors.push("The library is full (256 files). No more files were imported."); break; }
      const extension = path.extname(file).slice(1).toLowerCase();
      if (!extensions.includes(extension)) { errors.push(`${path.basename(file)}: unsupported file type.`); continue; }
      const id = randomUUID(), fileName = `${id}.${extension}`, destination = path.join(directory(), fileName);
      try {
        const stat = await fs.stat(file);
        if (!stat.isFile() || !stat.size) throw Error("The file is empty or unavailable.");
        await fs.copyFile(file, destination, 1);
        const entry: Entry = { id, fileName, name: path.basename(file).slice(0, 200), kind };
        library().set("items", [...items, entry]); items.push(entry);
      } catch (error) {
        await fs.unlink(destination).catch(() => undefined);
        errors.push(`${path.basename(file)}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { items: listBackgroundMedia(), errors };
  } finally { importing = false; }
};
export function registerBackgroundMediaIpc(owner: WebContents) {
  studio = owner;
  if (registered) return;
  registered = true;
  const guard = (sender: WebContents) => { if (sender !== studio || sender.isDestroyed()) throw Error("Backgrounds are managed from the studio."); };
  ipcMain.handle(IpcChannels.listBackgroundMedia, event => { guard(event.sender); return listBackgroundMedia(); });
  ipcMain.handle(IpcChannels.importBackgroundMedia, (event, kind: "image" | "video") => { guard(event.sender); return importBackgroundMedia(kind, event.sender); });
}

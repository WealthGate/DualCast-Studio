import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const mocks = vi.hoisted(() => ({ userData: "", items: [] as unknown[], choose: vi.fn(), save: vi.fn(), handle: vi.fn() }));
vi.mock("electron", () => ({
  app: { getPath: () => mocks.userData }, BrowserWindow: { fromWebContents: () => null },
  dialog: { showOpenDialog: mocks.choose }, ipcMain: { handle: mocks.handle }
}));
vi.mock("electron-store", () => ({ default: class {
  get() { return mocks.items; }
  set(_key: string, value: unknown[]) { mocks.save(value); mocks.items = value; }
} }));
import { importBackgroundMedia, listBackgroundMedia, registerBackgroundMediaIpc } from "../backgroundMediaService";
import { IpcChannels } from "../../../src/shared/ipc";
import type { WebContents } from "electron";

const folders: string[] = [];
const owner = { isDestroyed: () => false } as WebContents;
beforeEach(async () => {
  vi.clearAllMocks(); mocks.items = [];
  mocks.userData = await fs.mkdtemp(path.join(os.tmpdir(), "openchurch-backgrounds-")); folders.push(mocks.userData);
});
afterAll(async () => { for (const folder of folders) await fs.rm(folder, { recursive: true, force: true }); });

describe("managed background uploads", () => {
  it("copies uploads, lists their names and types, and survives a moved original", async () => {
    const source = path.join(mocks.userData, "welcome.png"); await fs.writeFile(source, "image bytes");
    mocks.choose.mockResolvedValue({ canceled: false, filePaths: [source] });
    const result = await importBackgroundMedia("image", owner);
    expect(result.errors).toEqual([]); expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ name: "welcome.png", kind: "image", missing: false });
    await fs.rename(source, source + ".moved");
    expect(await fs.readFile(fileURLToPath(result.items[0].url), "utf8")).toBe("image bytes");
    expect(listBackgroundMedia()).toEqual(result.items);
  });
  it("keeps successful video uploads visible alongside individual upload errors", async () => {
    const good = path.join(mocks.userData, "loop.webm"), empty = path.join(mocks.userData, "empty.mp4");
    await fs.writeFile(good, "video bytes"); await fs.writeFile(empty, "");
    mocks.choose.mockResolvedValue({ canceled: false, filePaths: [good, empty, path.join(mocks.userData, "wrong.exe")] });
    const result = await importBackgroundMedia("video", owner);
    expect(result.items).toHaveLength(1); expect(result.items[0]).toMatchObject({ name: "loop.webm", kind: "video" });
    expect(result.errors).toHaveLength(2); expect(result.errors.join(" ")).toContain("empty.mp4");
    await fs.unlink(fileURLToPath(result.items[0].url));
    expect(listBackgroundMedia()[0].missing).toBe(true);
  });
  it("retains the library on cancel and releases the import lock after a dialog failure", async () => {
    mocks.choose.mockRejectedValueOnce(Error("Dialog closed"));
    await expect(importBackgroundMedia("image", owner)).rejects.toThrow("Dialog closed");
    mocks.choose.mockResolvedValue({ canceled: true, filePaths: [] });
    await expect(importBackgroundMedia("image", owner)).resolves.toEqual({ items: [], errors: [] });
    expect(mocks.save).not.toHaveBeenCalled();
  });
  it("does not leave copied files behind when saving the library fails", async () => {
    const source = path.join(mocks.userData, "welcome.png"); await fs.writeFile(source, "image bytes");
    mocks.choose.mockResolvedValue({ canceled: false, filePaths: [source] }); mocks.save.mockImplementationOnce(() => { throw Error("Disk full"); });
    const result = await importBackgroundMedia("image", owner);
    expect(result.items).toEqual([]); expect(result.errors[0]).toContain("Disk full");
    expect(await fs.readdir(path.join(mocks.userData, "background-media"))).toEqual([]);
  });
  it("rejects non-studio callers and refreshes ownership when the studio reopens", () => {
    registerBackgroundMediaIpc(owner);
    const list = mocks.handle.mock.calls.find(([channel]) => channel === IpcChannels.listBackgroundMedia)![1];
    expect(() => list({ sender: {} })).toThrow("managed from the studio");
    const replacement = { isDestroyed: () => false } as WebContents;
    registerBackgroundMediaIpc(replacement);
    expect(() => list({ sender: owner })).toThrow(); expect(list({ sender: replacement })).toEqual([]);
  });
});

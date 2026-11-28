import { EventEmitter } from "events";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => any>(), exists: vi.fn(), values: {} as Record<string, any> }));
vi.mock("electron", () => ({
  app: { isPackaged: false, getAppPath: () => "/studio", getPath: () => "/profile" },
  BrowserWindow: { getAllWindows: () => [] }, dialog: {},
  ipcMain: { handle: (name: string, fn: (...args: any[]) => any) => mocks.handlers.set(name, fn), on: vi.fn() }
}));
vi.mock("electron-store", () => ({ default: class {
  get(key: string) { return mocks.values[key] ?? []; }
  set(key: string, value: unknown) { mocks.values[key] = value; }
} }));
vi.mock("fs", () => ({ existsSync: mocks.exists }));
import { getAudioPluginStatus, registerAudioPluginIpc } from "../audioPluginService";
import { IpcChannels } from "../../../src/shared/ipc";

describe.skipIf(process.platform !== "win32" || process.arch !== "x64")("audio plugin activation diagnostics", () => {
  const studio = Object.assign(new EventEmitter(), { isDestroyed: () => false });
  registerAudioPluginIpc(studio as any);
  beforeEach(() => { mocks.exists.mockReturnValue(true); mocks.values = { plugins: [{ id: "reastream", name: "ReaStream", filePath: "/plugins/reastream.dll", hasEditor: true }], folders: [] }; });
  it("distinguishes a missing helper from an unsupported operating system", () => {
    mocks.exists.mockImplementation((file: string) => !file.endsWith("openchurch-audio-host.exe"));
    expect(getAudioPluginStatus()).toMatchObject({ supported: false, message: expect.stringContaining("audio host is missing") });
    expect(getAudioPluginStatus().message).toContain("Reinstall");
  });
  it("marks missing registered files and reports an actionable activation failure", async () => {
    mocks.exists.mockImplementation((file: string) => file.endsWith("openchurch-audio-host.exe"));
    expect(getAudioPluginStatus()).toMatchObject({ supported: true, plugins: [expect.objectContaining({ id: "reastream", available: false })] });
    await expect(mocks.handlers.get(IpcChannels.configureAudioPlugin)!({ sender: studio }, { action: "start", id: "reastream" })).rejects.toThrow("plugin file is missing");
    expect(getAudioPluginStatus().message).toContain("Add it again");
  });
  it("keeps plugin loading restricted to the studio owner", () => {
    expect(() => mocks.handlers.get(IpcChannels.getAudioPluginStatus)!({ sender: {} })).toThrow("controlled from the studio");
    expect(getAudioPluginStatus().plugins[0]).toMatchObject({ available: true, hasEditor: true });
    expect(getAudioPluginStatus().plugins[0]).not.toHaveProperty("filePath");
  });
  it("keeps Replace mode and diagnostics when an editor request races a stopped host", async () => {
    const configure = mocks.handlers.get(IpcChannels.configureAudioPlugin)!;
    await configure({ sender: studio }, { action: "routing", routing: "replace" });
    const failure = await configure({ sender: studio }, { action: "bridge-error" });
    expect(failure).toMatchObject({ running: false, routing: "replace", message: expect.stringContaining("Program audio stays silent") });
    await expect(configure({ sender: studio }, { action: "editor" })).resolves.toMatchObject({ message: failure.message });
  });
});

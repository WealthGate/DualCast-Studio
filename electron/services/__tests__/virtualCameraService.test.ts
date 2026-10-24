import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ handlers: new Map<string, (...args: any[]) => any>(), spawn: vi.fn(), exec: vi.fn(), copy: vi.fn() }));
vi.mock("electron", () => ({ app: { isPackaged: false, getAppPath: () => "/app", getPath: () => "/user" }, ipcMain: { handle: (name: string, fn: (...args: any[]) => any) => mocks.handlers.set(name, fn) } }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn, execFile: mocks.exec }));
vi.mock("node:fs/promises", () => ({ default: { access: async () => {}, readFile: async () => Buffer.from("camera"), mkdir: async () => {}, copyFile: mocks.copy } }));
import { registerVirtualCameraIpc, stopVirtualCamera } from "../virtualCameraService";
import { IpcChannels } from "../../../src/shared/ipc";
import { VIRTUAL_CAMERA_FRAME_BYTES } from "../../../src/shared/virtualCamera";

describe.skipIf(process.platform !== "win32" || process.arch !== "x64")("virtual camera transport", () => {
  const studio = Object.assign(new EventEmitter(), { isDestroyed: () => false, send: vi.fn() });
  registerVirtualCameraIpc(studio as any);
  const event = { sender: studio };
  const control = (action: string) => mocks.handlers.get(IpcChannels.configureVirtualCamera)!(event, action);
  const frame = (payload: unknown, sender = studio) => mocks.handlers.get(IpcChannels.virtualCameraFrame)!({ sender }, payload);
  let child: any;
  async function start() {
    mocks.exec.mockImplementation((_file, _args, _options, callback) => { callback(null, "", ""); });
    mocks.spawn.mockImplementation(() => {
      child = Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() });
      queueMicrotask(() => child.stdout.write("ready\n")); return child;
    });
    return control("start");
  }
  afterEach(() => { stopVirtualCamera(); vi.useRealTimers(); });
  it("allows one frame awaiting native acknowledgement, validates ownership, length and session", async () => {
    const status = await start(); expect(status.state).toBe("running");
    const data = new Uint8Array(VIRTUAL_CAMERA_FRAME_BYTES);
    expect(frame({ session: "old", data })).toBe(false);
    expect(frame({ session: status.session, data: data.subarray(1) })).toBe(false);
    expect(frame({ session: status.session, data }, {} as any)).toBe(false);
    let settled = false;
    const accepted = frame({ session: status.session, data }).then((result: boolean) => { settled = true; return result; });
    await Promise.resolve(); expect(settled).toBe(false);
    expect(frame({ session: status.session, data })).toBe(false);
    child.stdout.write("fra"); expect(settled).toBe(false); child.stdout.write("me\n");
    expect(await accepted).toBe(true);
    const pending = frame({ session: status.session, data });
    await control("stop"); expect(await pending).toBe(false); expect(child.stdin.writableEnded).toBe(true);
  });
  it("stops on renderer failure and releases pending IPC promises", async () => {
    const status = await start();
    const pending = frame({ session: status.session, data: new Uint8Array(VIRTUAL_CAMERA_FRAME_BYTES) });
    studio.emit("render-process-gone"); expect(await pending).toBe(false); expect(child.stdin.writableEnded).toBe(true);
  });
  it("stops a stalled sender and reports a useful error", async () => {
    vi.useFakeTimers(); const status = await start();
    const pending = frame({ session: status.session, data: new Uint8Array(VIRTUAL_CAMERA_FRAME_BYTES) });
    await vi.advanceTimersByTimeAsync(5001); expect(await pending).toBe(false);
    expect(studio.send).toHaveBeenLastCalledWith(IpcChannels.virtualCameraStatus, expect.objectContaining({ state: "error", session: undefined }));
  });
});

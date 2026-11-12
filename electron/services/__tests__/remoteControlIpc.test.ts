import { EventEmitter } from "events";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { WebContents } from "electron";
import { IpcChannels } from "../../../src/shared/ipc";
import type { RemoteCommand, RemoteCommandResult } from "../../../src/shared/remoteControl";

const mocks = vi.hoisted(() => ({ setPublisher: vi.fn(), updateState: vi.fn() }));
vi.mock("electron", async () => { const { EventEmitter } = await import("events"); return { ipcMain: new EventEmitter() }; });
vi.mock("../networkOutputService", () => ({ setRemoteCommandPublisher: mocks.setPublisher, updateRemoteControlState: mocks.updateState }));
import { ipcMain } from "electron";
import { registerRemoteControlIpc } from "../remoteControlIpc";

const createStudio = () => Object.assign(new EventEmitter(), { isDestroyed: () => false, send: vi.fn() });
afterEach(() => { ipcMain.removeAllListeners(); vi.clearAllMocks(); vi.useRealTimers(); });
describe("mobile IPC ownership and acknowledgements", () => {
  it("accepts state and command replies only from the registered studio", async () => {
    const studio = createStudio(); registerRemoteControlIpc(studio as unknown as WebContents);
    const publish = mocks.setPublisher.mock.calls[0][0] as (command: RemoteCommand) => Promise<RemoteCommandResult>;
    const result = publish({ action: "black", enabled: true });
    const request = studio.send.mock.calls[0][1];
    const reply = { id: request.id, ok: true, message: "Applied" };
    ipcMain.emit(IpcChannels.remoteCommandReply, { sender: {} }, reply);
    const observer = vi.fn(); void result.then(observer); await Promise.resolve(); expect(observer).not.toHaveBeenCalled();
    ipcMain.emit(IpcChannels.remoteCommandReply, { sender: studio }, reply);
    expect(await result).toEqual({ ok: true, message: "Applied" });
    ipcMain.emit(IpcChannels.remoteControlState, { sender: {} }, { scenes: [], slides: [] }); expect(mocks.updateState).not.toHaveBeenCalled();
    ipcMain.emit(IpcChannels.remoteControlState, { sender: studio }, { scenes: [], slides: [] }); expect(mocks.updateState).toHaveBeenCalledOnce();
    studio.emit("destroyed");
  });
  it("expires an unacknowledged command and clears pending work when the studio closes", async () => {
    vi.useFakeTimers();
    const studio = createStudio(); registerRemoteControlIpc(studio as unknown as WebContents);
    const publish = mocks.setPublisher.mock.calls[0][0] as (command: RemoteCommand) => Promise<RemoteCommandResult>;
    const timeout = publish({ action: "freeze", enabled: true }); await vi.advanceTimersByTimeAsync(10001);
    expect(await timeout).toMatchObject({ ok: false, message: expect.stringContaining("did not confirm") });
    const destroyed = publish({ action: "black", enabled: true }); studio.emit("destroyed");
    expect(await destroyed).toMatchObject({ ok: false, message: expect.stringContaining("closed") });
    expect(mocks.setPublisher).toHaveBeenLastCalledWith(null);
  });
});

import { ipcMain, type WebContents, type IpcMainEvent } from "electron";
import { randomUUID } from "crypto";
import { IpcChannels } from "../../src/shared/ipc";
import type { RemoteCommandReply, RemoteCommandResult, RemoteControlState } from "../../src/shared/remoteControl";
import { setRemoteCommandPublisher, updateRemoteControlState } from "./networkOutputService";

export const registerRemoteControlIpc = (studio: WebContents) => {
  const pending = new Map<string, { finish: (result: RemoteCommandResult) => void }>();
  const onState = (event: IpcMainEvent, state: RemoteControlState) => {
    if (event.sender === studio && state && Array.isArray(state.scenes) && Array.isArray(state.slides)) updateRemoteControlState(state);
  };
  const onReply = (event: IpcMainEvent, reply: RemoteCommandReply) => {
    if (event.sender === studio && reply && typeof reply.id === "string" && typeof reply.ok === "boolean" && typeof reply.message === "string") pending.get(reply.id)?.finish({ ok: reply.ok, message: reply.message });
  };
  ipcMain.on(IpcChannels.remoteControlState, onState);
  ipcMain.on(IpcChannels.remoteCommandReply, onReply);
  setRemoteCommandPublisher(command => new Promise(resolve => {
    if (studio.isDestroyed()) { resolve({ ok: false, message: "Studio closed. Reconnect before trying again." }); return; }
    const id = randomUUID(), expiresAt = Date.now() + 10_000;
    const timer = setTimeout(() => finish({ ok: false, message: "Studio did not confirm the command. Check live status before trying again." }), 10_000);
    const finish = (result: RemoteCommandResult) => { clearTimeout(timer); pending.delete(id); resolve(result); };
    pending.set(id, { finish });
    try { studio.send(IpcChannels.remoteCommand, { id, command, expiresAt }); }
    catch { finish({ ok: false, message: "Studio disconnected. Command was not delivered." }); }
  }));
  studio.once("destroyed", () => {
    ipcMain.removeListener(IpcChannels.remoteControlState, onState);
    ipcMain.removeListener(IpcChannels.remoteCommandReply, onReply);
    setRemoteCommandPublisher(null); updateRemoteControlState(null);
    for (const item of pending.values()) item.finish({ ok: false, message: "Studio closed before confirming the command." });
  });
};

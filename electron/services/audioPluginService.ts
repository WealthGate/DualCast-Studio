import { app, BrowserWindow, dialog, ipcMain, WebContents } from "electron";
import Store from "electron-store";
import { spawn, ChildProcessWithoutNullStreams } from "child_process";
import { existsSync } from "fs";
import fs from "fs/promises";
import path from "path";
import { randomUUID } from "crypto";
import { AudioPluginBlock, AudioPluginInfo, AudioPluginStatus, AUDIO_PLUGIN_BLOCK_FRAMES, AUDIO_PLUGIN_SAMPLE_RATE } from "../../src/shared/audioPlugins";
import { IpcChannels } from "../../src/shared/ipc";
import { AudioPluginPacketReader, pluginPacket } from "./audioPluginProtocol";

type RegisteredPlugin = AudioPluginInfo & { filePath: string };
type HostEvent = Partial<AudioPluginInfo> & { event?: string; error?: string; message?: string; protocol?: number };
type PluginSession = {
  id: string; plugin: RegisteredPlugin; owner: WebContents; child: ChildProcessWithoutNullStreams;
  pending: Map<number, number>; timer: ReturnType<typeof setInterval>; writable: boolean;
};
let registry: Store<{ plugins: RegisteredPlugin[] }> | null = null;
let current: PluginSession | null = null;
let stoppedHosts: Promise<void> = Promise.resolve();
let busy = false;
let message = "Add a plugin from this device, then enable it for Program audio.";
const getRegistry = () => registry ??= new Store({ name: "audio-plugins", defaults: { plugins: [] as RegisteredPlugin[] } });
const hostPath = () => path.join(app.isPackaged ? process.resourcesPath : app.getAppPath() + "/assets", "audio-host", "openchurch-audio-host.exe");
const supported = () => process.platform === "win32" && process.arch === "x64" && existsSync(hostPath());
const plugins = () => getRegistry().get("plugins").filter(plugin => plugin && typeof plugin.id === "string" && typeof plugin.filePath === "string");
const publicPlugin = ({ filePath: _filePath, ...info }: RegisteredPlugin): AudioPluginInfo => info;
export const getAudioPluginStatus = (): AudioPluginStatus => ({
  supported: supported(), plugins: plugins().map(publicPlugin), activeId: current?.plugin.id ?? null,
  running: Boolean(current), session: current?.id ?? null,
  message: supported() ? message : "Native plugins require the Windows x64 desktop app. Supported format: VST2 (.dll)."
});
const publish = () => BrowserWindow.getAllWindows().forEach(window => {
  if (!window.isDestroyed()) window.webContents.send(IpcChannels.audioPluginStatus, getAudioPluginStatus());
});

const launch = (pluginPath: string, statePath?: string) => spawn(hostPath(), [
  "--plugin", pluginPath, "--sample-rate", String(AUDIO_PLUGIN_SAMPLE_RATE), "--block-size", String(AUDIO_PLUGIN_BLOCK_FRAMES),
  ...(statePath ? ["--state", statePath] : ["--probe"])
], { windowsHide: true, cwd: path.dirname(pluginPath), stdio: ["pipe", "pipe", "pipe"] });

const waitForReady = (child: ChildProcessWithoutNullStreams, onEvent: (event: HostEvent) => void) => new Promise<HostEvent>((resolve, reject) => {
  let pending = "";
  let done = false;
  const timer = setTimeout(() => finish(new Error("The plugin did not respond within 10 seconds.")), 10_000);
  const finish = (error?: Error, ready?: HostEvent) => {
    if (done) return;
    done = true; clearTimeout(timer);
    error ? reject(error) : resolve(ready!);
  };
  child.once("error", error => finish(error));
  child.once("exit", code => finish(new Error(`The plugin host exited (${code ?? "unknown"}).`)));
  child.stderr.on("data", (data: Buffer) => {
    pending += data.toString();
    if (pending.length > 65536) { finish(new Error("The plugin produced invalid status data.")); child.kill(); return; }
    let end: number;
    while ((end = pending.indexOf("\n")) >= 0) {
      const line = pending.slice(0, end); pending = pending.slice(end + 1);
      try {
        const event = JSON.parse(line) as HostEvent;
        if (event.event === "ready" && event.protocol === 1) finish(undefined, event);
        else if (event.event === "error") finish(new Error(event.message ?? event.error ?? "Plugin failed to load."));
        onEvent(event);
      } catch { /* Native libraries sometimes write diagnostics to stderr. */ }
    }
  });
});

const stopSession = (reason?: string) => {
  const session = current;
  current = null;
  if (session) {
    clearInterval(session.timer);
    session.pending.clear();
    // Give the editor/state a chance to save. A stuck/crashed third-party plugin
    // is killed independently; Program's worklet falls back to delayed dry audio.
    const stopping = new Promise<void>(resolve => {
      if (session.child.exitCode !== null || session.child.signalCode !== null) { resolve(); return; }
      const killTimer = setTimeout(() => session.child.kill(), 1500);
      killTimer.unref();
      session.child.once("exit", () => { clearTimeout(killTimer); resolve(); });
      if (!session.child.killed && session.child.stdin.writable) session.child.stdin.end(pluginPacket(4));
      else session.child.kill();
    });
    stoppedHosts = Promise.all([stoppedHosts, stopping]).then(() => undefined);
  }
  if (reason) message = reason;
  publish();
};
export const stopAudioPlugins = () => stopSession();

const addPlugin = async (owner: WebContents) => {
  if (!supported()) throw new Error(getAudioPluginStatus().message);
  const window = BrowserWindow.fromWebContents(owner);
  const options: Electron.OpenDialogOptions = { title: "Add a Windows x64 VST2 plugin", properties: ["openFile"], filters: [{ name: "VST2 plugin (64-bit)", extensions: ["dll"] }] };
  const selected = window ? await dialog.showOpenDialog(window, options) : await dialog.showOpenDialog(options);
  if (selected.canceled || !selected.filePaths[0]) return getAudioPluginStatus();
  const filePath = path.resolve(selected.filePaths[0]);
  const existing = plugins();
  if (existing.some(plugin => plugin.filePath.toLowerCase() === filePath.toLowerCase())) return getAudioPluginStatus();
  if (existing.length >= 64) throw new Error("Remove an unused plugin before adding more.");
  const file = await fs.open(filePath, "r");
  try {
    const header = Buffer.alloc(64);
    await file.read(header, 0, header.length, 0);
    const offset = header.readUInt32LE(60);
    if (header.readUInt16LE(0) !== 0x5a4d || offset > 16 * 1024 * 1024) throw new Error("Select a Windows x64 VST2 DLL.");
    const pe = Buffer.alloc(6); await file.read(pe, 0, pe.length, offset);
    if (pe.readUInt32LE(0) !== 0x4550 || pe.readUInt16LE(4) !== 0x8664) throw new Error("This host needs a 64-bit Windows plugin. 32-bit plugins are not supported.");
  } finally { await file.close(); }
  const child = launch(filePath);
  child.stdout.resume();
  try {
    const ready = await waitForReady(child, () => undefined);
    const info: RegisteredPlugin = {
      id: randomUUID(), filePath, name: String(ready.name ?? path.basename(filePath, ".dll")).slice(0, 200),
      vendor: String(ready.vendor ?? "").slice(0, 200), format: "vst2", hasEditor: ready.hasEditor === true,
      inputs: Number(ready.inputs) || 0, outputs: Number(ready.outputs) || 0, latencyFrames: Math.max(0, Number(ready.latencyFrames) || 0)
    };
    if (info.outputs < 1 || info.outputs > 64 || info.inputs > 64) throw new Error("This plugin does not expose a supported audio output.");
    getRegistry().set("plugins", [...existing, info]);
    message = `${info.name} added. Plugin files stay in their installed location on this device.`;
    publish(); return getAudioPluginStatus();
  } finally { child.kill(); }
};

const startPlugin = async (owner: WebContents, id: string) => {
  if (!supported()) throw new Error(getAudioPluginStatus().message);
  const plugin = plugins().find(item => item.id === id);
  if (!plugin || !existsSync(plugin.filePath)) throw new Error("The plugin file is missing. Add it again from this device.");
  stopSession();
  await stoppedHosts;
  const stateDirectory = path.join(app.getPath("userData"), "audio-plugin-state");
  await fs.mkdir(stateDirectory, { recursive: true });
  const child = launch(plugin.filePath, path.join(stateDirectory, `${plugin.id}.bin`));
  // Attach immediately: no third-party stderr/stdout pipe may fill unconsumed.
  const reader = new AudioPluginPacketReader();
  child.stdout.on("data", (data: Buffer) => {
    if (current?.child !== child) return;
    try {
      reader.push(data, (sequence, samples) => {
        const session = current;
        if (!session || session.child !== child || !session.pending.delete(sequence) || owner.isDestroyed()) return;
        owner.send(IpcChannels.audioPluginBlock, { session: session.id, sequence, samples } satisfies AudioPluginBlock);
      });
    } catch { if (current?.child === child) stopSession("The plugin returned invalid audio and was bypassed."); }
  });
  child.stdin.on("error", () => { if (current?.child === child) stopSession("The plugin stopped accepting audio and was bypassed."); });
  child.once("exit", () => { if (current?.child === child) stopSession("The plugin host stopped. Program continues with the source audio."); });
  try {
    const ready = await waitForReady(child, event => {
      if (event.event === "error" && current?.child === child) stopSession(event.message ?? "The plugin failed and was bypassed.");
    });
    const latencyFrames = Math.max(0, Math.ceil(Number(ready.latencyFrames) || 0));
    if (latencyFrames > 8192) throw new Error("This plugin needs more than 171 ms lookahead. Use a low-latency setting before enabling it for live audio.");
    plugin.latencyFrames = latencyFrames;
    getRegistry().set("plugins", plugins().map(item => item.id === plugin.id ? plugin : item));
    if (owner.isDestroyed() || child.exitCode !== null) throw new Error("The plugin host stopped before activation.");
    const session: PluginSession = {
      id: randomUUID(), plugin, owner, child, pending: new Map(), writable: true,
      timer: setInterval(() => {
        if (current?.child !== child) return;
        const oldest = current.pending.values().next().value;
        if (oldest !== undefined && Date.now() - oldest > 500) stopSession("The plugin took too long to process audio and was bypassed.");
      }, 100)
    };
    current = session;
    child.stdin.on("drain", () => { session.writable = true; });
    message = `${plugin.name} is processing Program audio.`;
    publish(); return getAudioPluginStatus();
  } catch (error) { child.kill(); throw error; }
};

// Register only for the studio's WebContents: projection and remote browser
// sources cannot select native code or send audio into another user's session.
export const registerAudioPluginIpc = (studio: WebContents) => {
  const guard = (sender: WebContents) => { if (sender !== studio || sender.isDestroyed()) throw new Error("Audio plugins are controlled from the studio."); };
  ipcMain.handle(IpcChannels.getAudioPluginStatus, event => { guard(event.sender); return getAudioPluginStatus(); });
  ipcMain.handle(IpcChannels.configureAudioPlugin, async (event, action: { action: string; id?: string }) => {
    guard(event.sender);
    if (busy) throw new Error("Wait for the current plugin operation to finish.");
    busy = true;
    try {
      if (action?.action === "add") return await addPlugin(studio);
      if (action?.action === "start" && typeof action.id === "string") return await startPlugin(studio, action.id);
      if (action?.action === "stop") { stopSession("Plugin bypassed. Program uses the source audio."); return getAudioPluginStatus(); }
      if (action?.action === "editor" && current?.owner === studio) { current.child.stdin.write(pluginPacket(2)); return getAudioPluginStatus(); }
      if (action?.action === "remove" && typeof action.id === "string") {
        if (current?.plugin.id === action.id) stopSession();
        getRegistry().set("plugins", plugins().filter(plugin => plugin.id !== action.id));
        message = "Plugin removed from the app. Its installed files are unchanged.";
        publish(); return getAudioPluginStatus();
      }
      throw new Error("Invalid audio plugin action.");
    } finally { busy = false; }
  });
  ipcMain.on(IpcChannels.audioPluginBlock, (event, block: AudioPluginBlock) => {
    const session = current;
    if (!session || event.sender !== studio || session.owner !== studio || block?.session !== session.id ||
      !Number.isSafeInteger(block.sequence) || block.sequence < 1 || block.sequence > 0xffffffff ||
      !(block.samples instanceof Float32Array) || block.samples.length !== AUDIO_PLUGIN_BLOCK_FRAMES * 2) return;
    if (!session.writable || session.pending.size >= 8 || session.pending.has(block.sequence)) return;
    const packet = pluginPacket(1, block.sequence, new Uint8Array(block.samples.buffer, block.samples.byteOffset, block.samples.byteLength));
    session.pending.set(block.sequence, Date.now());
    session.writable = session.child.stdin.write(packet);
  });
  studio.once("destroyed", () => stopSession());
};

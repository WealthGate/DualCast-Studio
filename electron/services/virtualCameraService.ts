import { safeSend } from "./safeSend";
import { app, ipcMain, WebContents } from "electron";
import { spawn, execFile, ChildProcessWithoutNullStreams } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { IpcChannels } from "../../src/shared/ipc";
import { VIRTUAL_CAMERA_FRAME_BYTES, VIRTUAL_CAMERA_NAME, VirtualCameraFrame, VirtualCameraStatus } from "../../src/shared/virtualCamera";

let owner: WebContents | null = null;
let child: ChildProcessWithoutNullStreams | null = null;
let pending: ((accepted: boolean) => void) | null = null;
let watchdog: ReturnType<typeof setTimeout> | undefined;
let operation: Promise<VirtualCameraStatus> | null = null;
let registered = false;
let generation = 0;
const supported = process.platform === "win32" && process.arch === "x64";
let status: VirtualCameraStatus = {
  supported, installed: false, state: "stopped", name: VIRTUAL_CAMERA_NAME,
  message: supported ? undefined : "Virtual Camera currently requires the Windows x64 desktop app."
};
const resources = () => app.isPackaged ? path.join(process.resourcesPath, "virtual-camera") : path.join(app.getAppPath(), "assets/virtual-camera");
const run = (file: string, args: string[]) => new Promise<void>((resolve, reject) => {
  execFile(file, args, { windowsHide: true, timeout: 15000 }, (error, _stdout, stderr) => error ? reject(new Error(stderr.trim() || error.message)) : resolve());
});
const publish = () => {
  if (owner && !owner.isDestroyed()) safeSend(owner, IpcChannels.virtualCameraStatus, status);
  return { ...status };
};
const armWatchdog = () => {
  clearTimeout(watchdog);
  watchdog = setTimeout(() => stopVirtualCamera("Virtual Camera stopped because Program frames stopped arriving. Start it again to reconnect."), 5000);
  watchdog.unref();
};
export function stopVirtualCamera(error?: string): VirtualCameraStatus {
  generation++;
  clearTimeout(watchdog);
  const previous = child; child = null;
  pending?.(false); pending = null;
  if (previous) {
    previous.stdin.end();
    const kill = setTimeout(() => { if (previous.exitCode === null) previous.kill(); }, 1000);
    kill.unref();
    previous.once("exit", () => clearTimeout(kill));
  }
  status = { ...status, state: error ? "error" : "stopped", session: undefined, message: error };
  return publish();
}
export async function getVirtualCameraStatus(): Promise<VirtualCameraStatus> {
  if (supported && status.state !== "running" && status.state !== "starting") {
    const files = resources();
    try {
      await fs.access(path.join(files, "x64/openchurch-camera-host.exe"));
      await fs.access(path.join(files, "x86/openchurch-camera-host.exe"));
      const checks = await Promise.allSettled(["x64", "x86"].map(arch => run(path.join(files, arch, "openchurch-camera-host.exe"), ["--status"])));
      status = { ...status, installed: checks.some(result => result.status === "fulfilled") };
    } catch { status = { ...status, installed: false, message: "The bundled camera component is missing. Reinstall OpenChurch or build it with prepare:virtual-camera." }; }
  }
  return { ...status };
}
async function installCamera(): Promise<string> {
  const source = resources();
  // Different DLL bytes receive a new directory, preserving DLLs loaded by other apps.
  const digest = createHash("sha256");
  for (const arch of ["x64", "x86"]) for (const name of ["openchurch-camera.dll", "openchurch-camera-host.exe"]) digest.update(await fs.readFile(path.join(source, arch, name)));
  const destination = path.join(app.getPath("userData"), "virtual-camera", digest.digest("hex").slice(0, 24));
  for (const arch of ["x64", "x86"]) {
    const target = path.join(destination, arch); await fs.mkdir(target, { recursive: true });
    for (const name of ["openchurch-camera.dll", "openchurch-camera-host.exe"]) {
      try { await fs.copyFile(path.join(source, arch, name), path.join(target, name), 1); }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    }
    await run(path.join(target, "openchurch-camera-host.exe"), ["--install"]);
  }
  status = { ...status, installed: true };
  return path.join(destination, "x64/openchurch-camera-host.exe");
}
async function startCamera(): Promise<VirtualCameraStatus> {
  const attempt = generation;
  const checked = await getVirtualCameraStatus();
  if (!checked.installed) throw Error("Install the virtual camera first, then reopen the camera list in your meeting app.");
  const executable = await installCamera();
  if (attempt !== generation || !owner || owner.isDestroyed()) return { ...status };
  status = { ...status, state: "starting", session: randomUUID(), message: undefined }; publish();
  return new Promise((resolve, reject) => {
    const process = spawn(executable, ["--send"], { windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    child = process;
    let ready = false, stdout = "", stderr = "";
    const timer = setTimeout(() => { if (child === process) stopVirtualCamera("The virtual camera did not start in time."); reject(Error("The virtual camera did not start in time.")); }, 10000);
    process.stderr.on("data", data => { stderr = (stderr + data.toString()).slice(-2048); });
    process.stdin.on("error", () => { if (child === process) stopVirtualCamera("The virtual camera connection was closed."); });
    process.stdout.on("data", data => {
      if (child !== process) return;
      stdout += data.toString();
      if (stdout.length > 4096) { stopVirtualCamera("Invalid response from the camera component."); return; }
      let end: number;
      while ((end = stdout.indexOf("\n")) !== -1) {
        const line = stdout.slice(0, end).trim(); stdout = stdout.slice(end + 1);
        if (line === "ready" && !ready) { ready = true; clearTimeout(timer); status = { ...status, state: "running" }; armWatchdog(); resolve(publish()); }
        else if (line === "frame" && pending) { const done = pending; pending = null; armWatchdog(); done(true); }
      }
    });
    const failed = (message: string) => { clearTimeout(timer); if (child === process) stopVirtualCamera(message); if (!ready) reject(Error(message)); };
    process.once("error", error => failed(error.message));
    process.once("exit", code => failed(stderr.trim() || `The virtual camera stopped (${code ?? "terminated"}).`));
  });
}
async function configure(action: string): Promise<VirtualCameraStatus> {
  if (!supported) return { ...status };
  if (action === "stop") return stopVirtualCamera();
  if (action === "start" && child) return { ...status };
  if (action !== "start" && action !== "install" && action !== "uninstall") throw Error("Invalid virtual camera action.");
  try {
    if (action === "start") return await startCamera();
    stopVirtualCamera();
    if (action === "install") { await installCamera(); status = { ...status, state: "stopped", message: "Camera installed. Start it, then select OpenChurch Virtual Camera in your other app. Reopen that app if needed." }; }
    else {
      // Attempt both registry views even if one was manually removed.
      const results = await Promise.allSettled(["x64", "x86"].map(arch => run(path.join(resources(), arch, "openchurch-camera-host.exe"), ["--uninstall"])));
      await getVirtualCameraStatus();
      if (status.installed || results.every(result => result.status === "rejected")) throw Error("Could not remove the camera registration. Close apps using it and try again.");
      status = { ...status, installed: false, message: "Camera removed. Reopen other apps to refresh their camera lists." };
    }
    return publish();
  } catch (error) { await getVirtualCameraStatus(); return stopVirtualCamera(error instanceof Error ? error.message : String(error)); }
}
export function registerVirtualCameraIpc(studio: WebContents) {
  owner = studio;
  studio.once("destroyed", () => { if (owner === studio) { stopVirtualCamera(); owner = null; } });
  studio.on("render-process-gone", () => { if (owner === studio) stopVirtualCamera(); });
  studio.on("did-start-loading", () => { if (owner === studio) stopVirtualCamera(); });
  if (registered) return;
  registered = true;
  ipcMain.handle(IpcChannels.getVirtualCameraStatus, event => event.sender === owner ? getVirtualCameraStatus() : { ...status, supported: false });
  ipcMain.handle(IpcChannels.configureVirtualCamera, (event, action: string) => {
    if (event.sender !== owner) throw Error("Only the studio can control Virtual Camera.");
    if (operation) return operation;
    operation = configure(action).finally(() => { operation = null; });
    return operation;
  });
  ipcMain.handle(IpcChannels.virtualCameraFrame, (event, frame: VirtualCameraFrame) => {
    if (event.sender !== owner || !child || status.state !== "running" || frame?.session !== status.session || pending || !(frame.data instanceof Uint8Array) || frame.data.byteLength !== VIRTUAL_CAMERA_FRAME_BYTES) return false;
    const target = child;
    return new Promise<boolean>(resolve => {
      pending = resolve;
      target.stdin.write(frame.data, error => { if (error && child === target) stopVirtualCamera(error.message); });
    });
  });
}

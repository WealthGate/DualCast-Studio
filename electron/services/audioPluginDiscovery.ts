import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";

export const pluginPathKey = (file: string) => path.resolve(file).toLowerCase();

export const defaultVstFolders = async () => {
  const programFiles = process.env.ProgramW6432 || process.env.ProgramFiles || "C:\\Program Files";
  const commonFiles = process.env.CommonProgramW6432 || process.env.CommonProgramFiles || path.join(programFiles, "Common Files");
  const folders = [path.join(programFiles, "VSTPlugins"), path.join(programFiles, "Steinberg", "VstPlugins"),
    path.join(commonFiles, "VST2"), path.join(commonFiles, "Steinberg", "VST2"),
    path.join(commonFiles, "VST3"), ...(process.env.LOCALAPPDATA ? [path.join(process.env.LOCALAPPDATA, "Programs", "Common", "VST3")] : []),
    ...(process.env.VST_PATH?.split(path.delimiter).filter(Boolean) ?? [])];
  // Some installers register a custom location instead of using Program Files.
  for (const hive of ["HKCU", "HKLM"]) {
    const folder = await new Promise<string>(resolve => {
      execFile("reg.exe", ["query", `${hive}\\SOFTWARE\\VST`, "/v", "VSTPluginsPath", "/reg:64"],
        { windowsHide: true, timeout: 2000 }, (error, stdout) => resolve(error ? "" : stdout.match(/VSTPluginsPath\s+REG_SZ\s+(.+)/i)?.[1]?.trim() ?? ""));
    });
    if (folder) folders.push(folder);
  }
  return [...new Map(folders.map(folder => [pluginPathKey(folder), path.resolve(folder)])).values()];
};

export const resolveVstBinary = async (filePath: string) => {
  const extension = path.extname(filePath).toLowerCase();
  if (extension !== ".dll" && extension !== ".vst3") throw Error("Choose a Windows x64 VST2 .dll or VST3 .vst3 plugin.");
  let binary = filePath;
  if (extension === ".vst3" && (await fs.stat(filePath)).isDirectory()) {
    binary = path.join(filePath, "Contents", "x86_64-win", path.basename(filePath));
    if (!(await fs.stat(binary).catch(() => null))?.isFile()) throw Error("This VST3 bundle does not contain a Windows x64 plugin module.");
  }
  const file = await fs.open(binary, "r");
  try {
    const header = Buffer.alloc(64);
    const { bytesRead } = await file.read(header, 0, header.length, 0);
    const offset = header.readUInt32LE(60);
    if (bytesRead !== header.length || header.readUInt16LE(0) !== 0x5a4d || offset < 64 || offset > 16 * 1024 * 1024)
      throw Error("This file is not a Windows plugin binary.");
    const pe = Buffer.alloc(6);
    const read = await file.read(pe, 0, pe.length, offset);
    if (read.bytesRead !== pe.length || pe.readUInt32LE(0) !== 0x4550) throw Error("This file is not a Windows plugin binary.");
    if (pe.readUInt16LE(4) !== 0x8664) throw Error("This plugin is not Windows x64. Install the Windows 64-bit version.");
    return { binary, format: extension === ".vst3" ? "vst3" as const : "vst2" as const };
  } finally { await file.close(); }
};

export type PluginFiles = { files: string[]; issues: string[]; limited: boolean };
export const findVstPlugins = async (folders: string[]): Promise<PluginFiles> => {
  const result: PluginFiles = { files: [], issues: [], limited: false };
  const visited = new Set<string>(), candidates = new Set<string>();
  const add = (file: string) => {
    const key = pluginPathKey(file);
    if (!candidates.has(key)) { candidates.add(key); result.files.push(file); }
  };
  let entriesSeen = 0;
  const walk = async (folder: string, depth: number): Promise<void> => {
    const key = pluginPathKey(folder);
    if (visited.has(key)) return;
    visited.add(key);
    let entries;
    try { entries = await fs.readdir(folder, { withFileTypes: true }); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") result.issues.push(`${folder}: folder could not be read.`);
      return;
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (++entriesSeen > 10000 || result.files.length >= 256) { result.limited = true; return; }
      const file = path.join(folder, entry.name);
      const extension = path.extname(entry.name).toLowerCase();
      // A bundle is one plugin module. Its internals must not be scanned separately.
      if ((entry.isFile() || entry.isDirectory()) && extension === ".vst3") add(file);
      else if (entry.isDirectory()) {
        if (depth < 12) await walk(file, depth + 1);
        else result.limited = true;
      } else if (entry.isFile() && extension === ".dll") add(file);
      if (entriesSeen > 10000 || result.files.length >= 256) { result.limited = true; return; }
    }
  };
  for (const folder of folders) {
    if (result.files.length >= 256) break;
    if (path.extname(folder).toLowerCase() === ".vst3") add(path.resolve(folder));
    else await walk(path.resolve(folder), 0);
  }
  return result;
};

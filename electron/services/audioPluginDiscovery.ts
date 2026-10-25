import fs from "fs/promises";
import path from "path";
import { execFile } from "child_process";

export const pluginPathKey = (file: string) => path.resolve(file).toLowerCase();

export const defaultVstFolders = async () => {
  const programFiles = process.env.ProgramW6432 || process.env.ProgramFiles || "C:\\Program Files";
  const commonFiles = process.env.CommonProgramW6432 || process.env.CommonProgramFiles || path.join(programFiles, "Common Files");
  const folders = [path.join(programFiles, "VSTPlugins"), path.join(programFiles, "Steinberg", "VstPlugins"),
    path.join(commonFiles, "VST2"), path.join(commonFiles, "Steinberg", "VST2"),
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

export const validateVstDll = async (filePath: string) => {
  if (path.extname(filePath).toLowerCase() !== ".dll") throw Error("Choose the Windows 64-bit VST2 .dll version. VST3 files are not supported.");
  const file = await fs.open(filePath, "r");
  try {
    const header = Buffer.alloc(64);
    const { bytesRead } = await file.read(header, 0, header.length, 0);
    const offset = header.readUInt32LE(60);
    if (bytesRead !== header.length || header.readUInt16LE(0) !== 0x5a4d || offset < 64 || offset > 16 * 1024 * 1024)
      throw Error("This file is not a Windows VST2 DLL.");
    const pe = Buffer.alloc(6);
    const read = await file.read(pe, 0, pe.length, offset);
    if (read.bytesRead !== pe.length || pe.readUInt32LE(0) !== 0x4550) throw Error("This file is not a Windows VST2 DLL.");
    if (pe.readUInt16LE(4) !== 0x8664) throw Error("This plugin is not Windows x64. Install the 64-bit ReaPlugs/VST2 version; 32-bit plugins are not supported.");
  } finally { await file.close(); }
};

export type PluginFiles = { files: string[]; issues: string[]; limited: boolean };
export const findVstDlls = async (folders: string[]): Promise<PluginFiles> => {
  const result: PluginFiles = { files: [], issues: [], limited: false };
  const visited = new Set<string>();
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
      // Avoid junction cycles and VST3 bundles; the host only loads VST2 DLLs.
      if (entry.isDirectory() && !entry.name.toLowerCase().endsWith(".vst3")) {
        if (depth < 12) await walk(file, depth + 1);
        else result.limited = true;
      } else if (entry.isFile() && path.extname(entry.name).toLowerCase() === ".dll") result.files.push(file);
      if (entriesSeen > 10000 || result.files.length >= 256) { result.limited = true; return; }
    }
  };
  for (const folder of folders) await walk(path.resolve(folder), 0);
  return result;
};

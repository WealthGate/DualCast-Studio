import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { findVstDlls, validateVstDll } from "../audioPluginDiscovery";

const directories: string[] = [];
const temporary = async () => {
  const folder = await mkdtemp(path.join(os.tmpdir(), "openchurch-vst-scan-"));
  directories.push(folder); return folder;
};
afterEach(async () => { for (const folder of directories.splice(0)) await rm(folder, { recursive: true, force: true }); });
const pe = (machine: number) => {
  const bytes = Buffer.alloc(134); bytes.writeUInt16LE(0x5a4d); bytes.writeUInt32LE(128, 60);
  bytes.writeUInt32LE(0x4550, 128); bytes.writeUInt16LE(machine, 132); return bytes;
};
describe("VST discovery", () => {
  it("finds nested DLLs once across overlapping folders and skips VST3 bundles", async () => {
    const folder = await temporary(); const nested = path.join(folder, "ReaPlugs");
    await mkdir(nested); await mkdir(path.join(folder, "effect.vst3"));
    await writeFile(path.join(nested, "reastream-standalone.dll"), pe(0x8664));
    await writeFile(path.join(folder, "effect.vst3", "internal.dll"), pe(0x8664));
    await writeFile(path.join(folder, "notes.txt"), "not a plugin");
    const result = await findVstDlls([folder, nested, path.join(folder, "absent")]);
    expect(result).toEqual({ files: [path.join(nested, "reastream-standalone.dll")], issues: [], limited: false });
  });
  it("accepts x64 PE files and explains 32-bit, truncated, invalid and VST3 files", async () => {
    const folder = await temporary(); const dll = path.join(folder, "effect.dll");
    await writeFile(dll, pe(0x8664)); await expect(validateVstDll(dll)).resolves.toBeUndefined();
    await writeFile(dll, pe(0x14c)); await expect(validateVstDll(dll)).rejects.toThrow("64-bit ReaPlugs/VST2");
    await writeFile(dll, Buffer.from("MZ")); await expect(validateVstDll(dll)).rejects.toThrow("not a Windows VST2");
    await writeFile(dll, Buffer.alloc(134)); await expect(validateVstDll(dll)).rejects.toThrow("not a Windows VST2");
    await expect(validateVstDll(path.join(folder, "effect.vst3"))).rejects.toThrow("VST3 files are not supported");
  });
  it("bounds a large scan and reports that the operator should choose a smaller folder", async () => {
    const folder = await temporary();
    await Promise.all(Array.from({ length: 260 }, (_, index) => writeFile(path.join(folder, `${index}.dll`), "")));
    const result = await findVstDlls([folder]); expect(result.files).toHaveLength(256); expect(result.limited).toBe(true);
  });
});

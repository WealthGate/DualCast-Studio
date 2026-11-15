import { mkdtemp, mkdir, writeFile, rm } from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { findVstPlugins, resolveVstBinary } from "../audioPluginDiscovery";

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
  it("finds nested DLLs, VST3 files and bundles once, without scanning bundle internals", async () => {
    const folder = await temporary(); const nested = path.join(folder, "ReaPlugs");
    await mkdir(nested); await mkdir(path.join(folder, "effect.vst3"));
    await writeFile(path.join(nested, "reastream-standalone.dll"), pe(0x8664));
    await writeFile(path.join(folder, "effect.vst3", "internal.dll"), pe(0x8664));
    await writeFile(path.join(folder, "standalone.vst3"), pe(0x8664));
    await writeFile(path.join(folder, "notes.txt"), "not a plugin");
    const result = await findVstPlugins([folder, nested, path.join(folder, "effect.vst3"), path.join(folder, "absent")]);
    expect(result).toEqual({ files: [path.join(folder, "effect.vst3"), path.join(nested, "reastream-standalone.dll"), path.join(folder, "standalone.vst3")], issues: [], limited: false });
  });
  it("accepts x64 PE files and explains wrong architectures and invalid binaries", async () => {
    const folder = await temporary(); const dll = path.join(folder, "effect.dll");
    await writeFile(dll, pe(0x8664)); await expect(resolveVstBinary(dll)).resolves.toEqual({ binary: dll, format: "vst2" });
    await writeFile(dll, pe(0x14c)); await expect(resolveVstBinary(dll)).rejects.toThrow("not Windows x64");
    await writeFile(dll, Buffer.from("MZ")); await expect(resolveVstBinary(dll)).rejects.toThrow("not a Windows plugin binary");
    await writeFile(dll, Buffer.alloc(134)); await expect(resolveVstBinary(dll)).rejects.toThrow("not a Windows plugin binary");
  });
  it("opens the x64 module inside a Windows VST3 bundle", async () => {
    const folder = await temporary();
    const bundle = path.join(folder, "Effect.vst3");
    const modules = path.join(bundle, "Contents", "x86_64-win");
    await mkdir(bundle);
    await expect(resolveVstBinary(bundle)).rejects.toThrow("does not contain a Windows x64 plugin module");
    await mkdir(modules, { recursive: true });
    const binary = path.join(modules, "Effect.vst3");
    await writeFile(binary, pe(0x8664));
    await expect(resolveVstBinary(bundle)).resolves.toEqual({ binary, format: "vst3" });
  });
  it("bounds a large scan and reports that the operator should choose a smaller folder", async () => {
    const folder = await temporary();
    await Promise.all(Array.from({ length: 260 }, (_, index) => writeFile(path.join(folder, `${index}.dll`), "")));
    const result = await findVstPlugins([folder]); expect(result.files).toHaveLength(256); expect(result.limited).toBe(true);
  });
});

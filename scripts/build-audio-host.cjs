// Build the isolated x64 Windows VST2 host using the installed Visual C++ tools.
// The runtime is compiled into the binary; end users need no compiler/runtime install.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
if (process.platform !== "win32") {
  console.log("Native VST2 hosting is currently available on Windows x64.");
  process.exit(0);
}
const fixture = process.argv.includes("--test-fixture");
const programFiles86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
const vswhere = path.join(programFiles86, "Microsoft Visual Studio/Installer/vswhere.exe");
let install;
if (fs.existsSync(vswhere)) {
  const result = spawnSync(vswhere, ["-latest", "-products", "*", "-requires", "Microsoft.VisualStudio.Component.VC.Tools.x86.x64", "-property", "installationPath"], { windowsHide: true, encoding: "utf8" });
  if (result.status === 0) install = result.stdout.trim();
}
const vcvars = install && path.join(install, "VC/Auxiliary/Build/vcvars64.bat");
if (!vcvars || !fs.existsSync(vcvars)) throw new Error("Visual Studio C++ x64 build tools are required to build the audio plug-in host.");
const temp = path.join(root, "tmp/native-audio-host");
const output = path.join(root, "assets/audio-host");
fs.mkdirSync(temp, { recursive: true });
fs.mkdirSync(output, { recursive: true });
const source = path.join(root, "native/audio-host", fixture ? "test-plugin.cpp" : "main.cpp");
const executable = fixture ? path.join(temp, "test-plugin.dll") : path.join(output, "openchurch-audio-host.exe");
const object = path.join(temp, fixture ? "test-plugin.obj" : "audio-host.obj");
const build = path.join(temp, fixture ? "build-fixture.cmd" : "build.cmd");
fs.writeFileSync(build, [
  "@echo off",
  'call "%OC_HOST_VCVARS%" >nul',
  "if errorlevel 1 exit /b %errorlevel%",
  `cl.exe /nologo /std:c++17 /utf-8 /EHsc /O2 /MT /W4 /DUNICODE /D_UNICODE ${fixture ? "/LD " : ""}/Fo"%OC_HOST_OBJECT%" /Fe"%OC_HOST_EXECUTABLE%" "%OC_HOST_SOURCE%" /link user32.lib ole32.lib`,
  "exit /b %errorlevel%", ""
].join("\r\n"));
const result = spawnSync(process.env.ComSpec || "cmd.exe", ["/d", "/s", "/c", path.basename(build)], {
  cwd: temp, windowsHide: true, windowsVerbatimArguments: true, encoding: "utf8",
  env: { ...process.env, OC_HOST_VCVARS: vcvars, OC_HOST_SOURCE: source, OC_HOST_OBJECT: object, OC_HOST_EXECUTABLE: executable }
});
if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) throw new Error(`Native audio host compilation failed (${result.status}).`);
if (!fixture) {
  const digest = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
  fs.writeFileSync(path.join(output, "SOURCE.json"), JSON.stringify({
    source: "native/audio-host/main.cpp", protocol: 1, platform: "win32-x64", format: "vst2",
    sourceSHA256: digest(source), abiSHA256: digest(path.join(root, "native/audio-host/vst2-abi.h")),
    executableSHA256: digest(executable)
  }, null, 2));
  fs.copyFileSync(path.join(root, "native/audio-host/README.md"), path.join(output, "README.md"));
}
console.log(`Built ${executable}`);

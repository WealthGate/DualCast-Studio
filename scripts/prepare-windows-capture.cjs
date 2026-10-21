// Pin and verify the Windows Graphics Capture runtime. No user-time downloads:
// release installers include the executable and its license/source information.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const { spawnSync } = require("child_process");
const root = path.resolve(__dirname, "..");
const url = "https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-10-21-13-06/ffmpeg-n8.1.3-20-gc8de997cb1-win64-gpl-8.1.zip";
const sha256 = "3c018ceab05450a5ca7b628d102eee676ef6124580fab0c0bc033570d70523d5";
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
(async () => {
  if (process.platform !== "win32") return;
  const target = path.join(root, "assets/windows-capture");
  const executable = path.join(target, "ffmpeg.exe");
  const metadata = path.join(target, "SOURCE.json");
  if (fs.existsSync(executable) && fs.existsSync(metadata)) {
    const saved = JSON.parse(fs.readFileSync(metadata, "utf8"));
    if (saved.archiveSHA256 === sha256 && saved.executableSHA256 === hash(executable)) { console.log("Verified Windows capture runtime."); return; }
  }
  const temp = path.join(root, "tmp/windows-capture");
  fs.mkdirSync(temp, { recursive: true });
  const zip = path.join(temp, "runtime.zip");
  if (!fs.existsSync(zip) || hash(zip) !== sha256) {
    const response = await fetch(url);
    if (!response.ok) throw Error(`Capture runtime download failed: ${response.status}`);
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(zip));
  }
  if (hash(zip) !== sha256) throw Error("Windows capture runtime checksum mismatch.");
  const unpack = path.join(temp, "unpack");
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", "Expand-Archive -LiteralPath $env:OPENCHURCH_CAPTURE_ZIP -DestinationPath $env:OPENCHURCH_CAPTURE_UNPACK -Force"], {
    windowsHide: true, encoding: "utf8", env: { ...process.env, OPENCHURCH_CAPTURE_ZIP: zip, OPENCHURCH_CAPTURE_UNPACK: unpack }
  });
  if (result.status !== 0) throw Error(result.stderr || "Capture runtime extraction failed.");
  const folder = fs.readdirSync(unpack).map(name => path.join(unpack, name)).find(item => fs.existsSync(path.join(item, "bin/ffmpeg.exe")));
  if (!folder) throw Error("Windows capture executable missing from verified archive.");
  fs.mkdirSync(target, { recursive: true });
  fs.copyFileSync(path.join(folder, "bin/ffmpeg.exe"), executable);
  fs.copyFileSync(path.join(folder, "LICENSE.txt"), path.join(target, "LICENSE.txt"));
  fs.writeFileSync(metadata, JSON.stringify({ url, archiveSHA256: sha256, executableSHA256: hash(executable), source: "https://github.com/FFmpeg/FFmpeg/tree/c8de997cb1", buildSource: "https://github.com/BtbN/FFmpeg-Builds/tree/autobuild-2026-10-21-13-06" }, null, 2));
  const verify = spawnSync(executable, ["-hide_banner", "-h", "filter=gfxcapture"], { encoding: "utf8", windowsHide: true });
  if (verify.status !== 0 || !verify.stdout.includes("capture_cursor")) throw Error("Runtime does not support Windows Graphics Capture.");
  console.log("Installed verified Windows Graphics Capture runtime.");
})().catch(error => { console.error(error); process.exitCode = 1; });

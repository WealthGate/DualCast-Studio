// Pin and verify the Windows Graphics Capture runtime. No user-time downloads:
// release installers include the executable and its license/source information.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const { Readable } = require("stream");
const { pipeline } = require("stream/promises");
const { spawnSync } = require("child_process");
const root = path.resolve(__dirname, "..");
// BtbN rotates its autobuild assets. Keep the exact verified archive in our
// release assets so fresh builds do not depend on that retention window.
const url = "https://github.com/WealthGate/DualCast-Studio/releases/download/v0.6.43/openchurch-windows-capture-c8de997cb1.zip";
const originalUrl = "https://github.com/BtbN/FFmpeg-Builds/releases/download/autobuild-2026-10-21-13-06/ffmpeg-n8.1.3-20-gc8de997cb1-win64-gpl-8.1.zip";
const verifyDownload = process.argv.includes("--verify-download");
const sha256 = "3c018ceab05450a5ca7b628d102eee676ef6124580fab0c0bc033570d70523d5";
const executableSHA256 = "b6f0aa78559828c61c8efcc51f58faa010ebb82c643daaff1a33e23d9dacdb73";
const hash = file => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
(async () => {
  if (process.platform !== "win32") return;
  const target = path.join(root, "assets/windows-capture");
  const executable = path.join(target, "ffmpeg.exe");
  const metadata = path.join(target, "SOURCE.json");
  if (fs.existsSync(executable) && fs.existsSync(metadata)) {
    const saved = JSON.parse(fs.readFileSync(metadata, "utf8"));
    if (!verifyDownload && saved.archiveSHA256 === sha256 && saved.executableSHA256 === executableSHA256 && hash(executable) === executableSHA256 && fs.existsSync(path.join(target, "LICENSE.txt"))) { console.log("Verified Windows capture runtime."); return; }
  }
  const temp = path.join(root, "tmp/windows-capture");
  fs.mkdirSync(temp, { recursive: true });
  const zip = path.join(temp, "runtime.zip");
  if (verifyDownload || !fs.existsSync(zip) || hash(zip) !== sha256) {
    const response = await fetch(url);
    if (!response.ok) throw Error(`Capture runtime download failed: ${response.status}`);
    await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(zip));
  }
  if (hash(zip) !== sha256) throw Error("Windows capture runtime checksum mismatch.");
  fs.mkdirSync(target, { recursive: true });
  // Read the two pinned members directly. Fail on missing members and on
  // extraction errors instead of accepting a partially expanded archive.
  const extract = `
    $ErrorActionPreference = 'Stop'
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [IO.Compression.ZipFile]::OpenRead($env:OPENCHURCH_CAPTURE_ZIP)
    try {
      $prefix = 'ffmpeg-n8.1.3-20-gc8de997cb1-win64-gpl-8.1/'
      foreach ($member in @('LICENSE.txt', 'bin/ffmpeg.exe')) {
        $entry = $archive.GetEntry($prefix + $member)
        if ($null -eq $entry) { throw "Missing capture runtime archive entry $member" }
        $destination = Join-Path $env:OPENCHURCH_CAPTURE_TARGET $entry.Name
        [IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $destination, $true)
      }
    } finally { $archive.Dispose() }
  `;
  const result = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", extract], {
    windowsHide: true, encoding: "utf8", env: { ...process.env, OPENCHURCH_CAPTURE_ZIP: zip, OPENCHURCH_CAPTURE_TARGET: target }
  });
  if (result.status !== 0) throw Error(result.stderr || "Capture runtime extraction failed.");
  if (hash(executable) !== executableSHA256) throw Error("Extracted Windows capture executable checksum mismatch.");
  const verify = spawnSync(executable, ["-hide_banner", "-h", "filter=gfxcapture"], { encoding: "utf8", windowsHide: true });
  if (verify.status !== 0 || !verify.stdout.includes("capture_cursor")) throw Error("Runtime does not support Windows Graphics Capture.");
  fs.writeFileSync(metadata, JSON.stringify({ url, originalUrl, archiveSHA256: sha256, executableSHA256, source: "https://github.com/FFmpeg/FFmpeg/tree/c8de997cb1", buildSource: "https://github.com/BtbN/FFmpeg-Builds/tree/autobuild-2026-10-21-13-06" }, null, 2));
  console.log("Installed verified Windows Graphics Capture runtime.");
})().catch(error => { console.error(error); process.exitCode = 1; });

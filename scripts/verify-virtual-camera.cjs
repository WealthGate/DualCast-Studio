// Real external-camera acceptance check. Uses the current account temporarily.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const { once } = require('node:events');
if (process.platform !== 'win32') { console.log('SKIP: DirectShow camera requires Windows.'); process.exit(0); }
const root = path.resolve(__dirname, '..');
const base = path.join(root, 'assets/virtual-camera');
const helper = arch => path.join(base, arch, 'openchurch-camera-host.exe');
const run = (arch, action) => spawnSync(helper(arch), [action], { windowsHide: true, timeout: 15000, encoding: 'utf8' });
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(predicate, label, timeout = 8000) {
  const end = Date.now() + timeout;
  while (!predicate()) { if (Date.now() > end) throw Error('Timed out: ' + label); await wait(40); }
}
function quadrantFrame() {
  const data = Buffer.alloc(1280 * 720 * 4);
  const colors = [[255, 0, 0], [0, 255, 0], [0, 0, 255], [255, 255, 255]];
  for (let y = 0; y < 720; y++) for (let x = 0; x < 1280; x++) {
    const i = (y * 1280 + x) * 4, color = colors[(y >= 360 ? 2 : 0) + (x >= 640 ? 1 : 0)];
    data[i] = color[0]; data[i + 1] = color[1]; data[i + 2] = color[2]; data[i + 3] = 255;
  }
  return data;
}
(async () => {
  if (!process.argv.includes('--no-build')) {
    const built = spawnSync(process.execPath, [path.join(__dirname, 'build-virtual-camera.cjs')], { stdio: 'inherit', windowsHide: true, timeout: 180000 });
    assert.equal(built.status, 0, 'camera builds');
  }
  for (const arch of ['x64', 'x86']) assert.notEqual(run(arch, '--status').status, 0, 'Use a test account without an existing OpenChurch camera registration.');
  let capture, sender, senderTimer, stderr = '', frames = [], partial = Buffer.alloc(0);
  const installed = [];
  const stopSender = async (crash = false) => {
    clearTimeout(senderTimer); const current = sender; sender = undefined;
    if (!current) return;
    const exited = once(current, 'exit');
    if (crash) current.kill(); else current.stdin.end();
    await exited;
  };
  async function startSender(image) {
    sender = spawn(helper('x64'), ['--send'], { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let ready = false, sending = false, log = '';
    sender.stderr.on('data', chunk => { log += chunk; });
    sender.stdin.on('error', () => undefined);
    sender.stdout.on('data', chunk => {
      const lines = chunk.toString();
      if (lines.includes('ready')) ready = true;
      if ((lines.includes('ready') || lines.includes('frame')) && !sending) {
        sending = true;
        senderTimer = setTimeout(() => { sending = false; if (sender && !sender.stdin.destroyed) sender.stdin.write(image); }, 33);
      }
    });
    await until(() => ready || sender?.exitCode !== null, 'native sender ready');
    assert.ok(ready, log || 'camera sender exited before ready');
  }
  try {
    for (const arch of ['x64', 'x86']) {
      installed.push(arch); const install = run(arch, '--install'); assert.equal(install.status, 0, install.stderr);
      assert.equal(run(arch, '--status').status, 0);
      const probe = run(arch, '--probe'); assert.equal(probe.status, 0, probe.stderr); assert.match(probe.stdout, /1280x720@30/);
    }
    const ffmpeg = require('ffmpeg-static');
    const listed = spawnSync(ffmpeg, ['-hide_banner', '-list_devices', 'true', '-f', 'dshow', '-i', 'dummy'], { encoding: 'utf8', timeout: 15000, windowsHide: true });
    assert.match(listed.stderr, /OpenChurch Virtual Camera/, 'camera enumerates as an OS camera');
    capture = spawn(ffmpeg, ['-nostdin', '-hide_banner', '-loglevel', 'warning', '-f', 'dshow', '-rtbufsize', '8M', '-video_size', '1280x720', '-framerate', '30', '-i', 'video=OpenChurch Virtual Camera', '-an', '-vf', 'scale=4:4:flags=neighbor', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    capture.stderr.on('data', chunk => { stderr = (stderr + chunk).slice(-5000); });
    capture.stdout.on('data', chunk => {
      partial = Buffer.concat([partial, chunk]);
      while (partial.length >= 48) { frames.push(partial.subarray(0, 48)); partial = partial.subarray(48); if (frames.length > 300) frames.shift(); }
    });
    await until(() => frames.length > 2, 'black camera before sender: ' + stderr);
    assert.ok(frames.at(-1).every(value => value < 4), 'stopped camera is black before first sender');
    await startSender(quadrantFrame());
    const correct = frame => frame[0] > 240 && frame[1] < 10 && frame[2] < 10 && frame[9] < 10 && frame[10] > 240 && frame[11] < 10 && frame[36] < 10 && frame[37] < 10 && frame[38] > 240 && frame[45] > 240 && frame[46] > 240 && frame[47] > 240;
    await until(() => frames.slice(-3).some(correct), 'RGBA colors and upright quadrant orientation: ' + stderr);
    const conflict = run('x64', '--send'); assert.equal(conflict.status, 4, 'second producer cannot replace live feed');
    await stopSender(); await until(() => frames.slice(-5).length === 5 && frames.slice(-5).every(frame => frame.every(value => value < 4)), 'black output after Stop');
    await startSender(quadrantFrame()); await until(() => frames.slice(-3).some(correct), 'restart without reopening receiving app');
    await stopSender(true); await until(() => frames.slice(-5).every(frame => frame.every(value => value < 4)), 'black output after sender crash');
    await wait(1200); assert.ok(frames.slice(-20).every(frame => frame.every(value => value < 4)), 'crashed session cannot reappear');
    console.log('PASS: x64/x86 registration and COM formats, DirectShow camera enumeration, independent FFmpeg capture, 720p/30, RGB colors, upright orientation, single producer, black before start/after stop/crash, and restart with consumer connected.');
  } finally {
    await stopSender();
    if (capture && capture.exitCode === null) { const ended = once(capture, 'exit'); capture.kill(); await ended; }
    for (const arch of installed) { const removed = run(arch, '--uninstall'); if (removed.status !== 0) console.error('Camera test cleanup failed: ' + removed.stderr); assert.notEqual(run(arch, '--status').status, 0); }
  }
})().catch(error => { console.error(error); process.exitCode = 1; });

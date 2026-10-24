// Exercise real binary PCM, state, silent-source processing, bounds and isolation.
const fs = require("node:fs");
const path = require("node:path");
const assert = require("node:assert/strict");
const { spawnSync } = require("node:child_process");
if (process.platform !== "win32") {
  console.log("Native audio-host checks skipped: Windows x64 host."); process.exit(0);
}
const root = path.resolve(__dirname, "..");
function build(...args) {
  const run = spawnSync(process.execPath, [path.join(__dirname, "build-audio-host.cjs"), ...args], { windowsHide: true, encoding: "utf8", timeout: 120000 });
  assert.equal(run.status, 0, run.stdout + run.stderr);
}
build(); build("--test-fixture");
const exe = path.join(root, "assets/audio-host/openchurch-audio-host.exe");
const fixture = path.join(root, "tmp/native-audio-host/test-plugin.dll");
const state = path.join(root, "tmp/native-audio-host/test-settings.ocvst");
const stateGenerator = path.join(root, "tmp/native-audio-host/test-generator.ocvst");
const stateInvalid = path.join(root, "tmp/native-audio-host/test-invalid.ocvst");
function packet(type, id = 0, data = Buffer.alloc(0)) {
  const header = Buffer.alloc(16);
  [0x4f434156, type, id, data.length].forEach((n, index) => header.writeUInt32LE(n, index * 4));
  return Buffer.concat([header, data]);
}
function events(run) { return run.stderr.toString().trim().split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line)); }
function run(plugin, input = Buffer.alloc(0), args = [], extraEnv = {}) {
  return spawnSync(exe, ["--plugin", plugin, ...args], { input, windowsHide: true, timeout: 10000, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, ...extraEnv } });
}
function responses(bytes) {
  const out = []; let offset = 0;
  while (offset < bytes.length) {
    assert.ok(bytes.length - offset >= 16, "complete PCM header");
    assert.equal(bytes.readUInt32LE(offset), 0x4f434156);
    assert.equal(bytes.readUInt32LE(offset + 4), 1);
    const id = bytes.readUInt32LE(offset + 8), size = bytes.readUInt32LE(offset + 12);
    assert.ok(bytes.length - offset - 16 >= size, "complete PCM payload");
    out.push({ id, data: bytes.subarray(offset + 16, offset + 16 + size) }); offset += 16 + size;
  }
  return out;
}
function savedValue(file, value) {
  const data = Buffer.alloc(20);
  [0x3156434f, 0x4f435446, 1, 4].forEach((n, index) => data.writeUInt32LE(n, index * 4));
  data.writeFloatLE(value, 16); fs.writeFileSync(file, data);
}
const probe = run(fixture, undefined, ["--probe"]);
assert.equal(probe.status, 0, probe.stderr.toString());
assert.equal(events(probe)[0].protocol, 1); assert.equal(events(probe)[0].parameters, 2);
const pcm = Buffer.alloc(4500 * 8);
for (let sample = 0; sample < pcm.length / 4; ++sample) pcm.writeFloatLE(Math.sin(sample / 21) * 3, sample * 4);
savedValue(state, .5);
const mixed = run(fixture, Buffer.concat([packet(1, 41, pcm), packet(5, 1), packet(1, 42, pcm), packet(5, 0), packet(4)]), ["--state", state]);
assert.equal(mixed.status, 0, mixed.stderr.toString());
const output = responses(mixed.stdout);
assert.equal(output.length, 2); assert.equal(output[0].id, 41); assert.equal(output[1].id, 42);
for (let offset = 0; offset < pcm.length; offset += 4) {
  assert.equal(output[0].data.readFloatLE(offset), Math.fround(pcm.readFloatLE(offset) * .5));
  assert.equal(output[1].data.readFloatLE(offset), pcm.readFloatLE(offset));
}
assert.equal(fs.statSync(state).size, 20, "opaque state saved");
savedValue(state, .25);
const restored = run(fixture, packet(1, 7, pcm), ["--state", state]);
assert.equal(restored.status, 0, restored.stderr.toString());
assert.equal(responses(restored.stdout)[0].data.readFloatLE(8), Math.fround(pcm.readFloatLE(8) * .25));
savedValue(stateGenerator, -1);
const silent = Buffer.alloc(512 * 8);
const generated = run(fixture, packet(1, 8, silent), ["--state", stateGenerator]);
assert.equal(generated.status, 0, generated.stderr.toString());
for (let offset = 0; offset < silent.length; offset += 4) assert.equal(responses(generated.stdout)[0].data.readFloatLE(offset), .125, "network/generator effect gets silent audio clock");
savedValue(stateInvalid, 99);
const sanitized = run(fixture, packet(1, 9, pcm), ["--state", stateInvalid]);
assert.equal(sanitized.status, 0, sanitized.stderr.toString());
assert.ok(responses(sanitized.stdout)[0].data.equals(Buffer.alloc(pcm.length)), "non-finite output silenced");
const oversized = Buffer.alloc(16);
[0x4f434156, 1, 1, 8193 * 8].forEach((n, index) => oversized.writeUInt32LE(n, index * 4));
const bounded = run(fixture, oversized);
assert.ok(events(bounded).some(item => item.event === "error" && item.message.includes("Invalid audio packet")));
const wrong = run(path.join(process.env.SystemRoot || "C:\\Windows", "System32/kernel32.dll"), undefined, ["--probe"]);
assert.equal(wrong.status, 3); assert.equal(events(wrong)[0].event, "error");
const crashed = run(fixture, undefined, ["--probe"], { OPENCHURCH_TEST_PLUGIN_CRASH: "1" });
assert.notEqual(crashed.status, 0); assert.notEqual(crashed.error?.code, "ETIMEDOUT", "crashed effect terminated independently");
const activatedLatency = run(fixture, packet(1, 10, silent), [], { OPENCHURCH_TEST_PLUGIN_LATENCY_ON_ACTIVATE: "128" });
assert.equal(activatedLatency.status, 0, activatedLatency.stderr.toString());
assert.equal(events(activatedLatency)[0].latencyFrames, 128, "ready latency is sampled after effect activation");
const changedLatency = run(fixture, packet(1, 11, silent), [], { OPENCHURCH_TEST_PLUGIN_LATENCY_CHANGE: "1" });
assert.ok(events(changedLatency).some(item => item.event === "error" && item.message.includes("changed its processing latency")));
assert.equal(changedLatency.stdout.length, 0, "changed delay cannot enter the audio path before fallback");
const excessiveLatency = run(fixture, Buffer.alloc(0), [], { OPENCHURCH_TEST_PLUGIN_LATENCY_ON_ACTIVATE: "8193" });
assert.equal(excessiveLatency.status, 3);
assert.ok(events(excessiveLatency).some(item => item.event === "error" && item.message.includes("8192 frames")));
console.log("PASS: float32 stereo identity/order, unclipped samples, bypass, preset restore, silent-input generation, NaN sanitation, bounded packets, process crash isolation and activated/stable/bounded latency.");
if (process.argv.includes("--installed")) {
  for (const name of ["reaeq-standalone.dll", "reastream-standalone.dll"]) {
    const plugin = path.join(process.env.ProgramFiles || "C:\\Program Files", "VSTPlugins/ReaPlugs", name);
    if (!fs.existsSync(plugin)) { console.log(`SKIP: ${name} is not installed.`); continue; }
    const identified = run(plugin, undefined, ["--probe"]);
    assert.equal(identified.status, 0, identified.stderr.toString());
    const metadata = events(identified)[0];
    assert.equal(metadata.format, "vst2"); assert.equal(metadata.hasEditor, true);
    const processed = run(plugin, Buffer.concat([packet(1, 20, pcm), packet(1, 21, silent), packet(4)]));
    assert.equal(processed.status, 0, processed.stderr.toString());
    const blocks = responses(processed.stdout); assert.equal(blocks.length, 2);
    assert.equal(blocks[0].data.length, pcm.length); assert.equal(blocks[1].data.length, silent.length);
    for (const block of blocks) for (let offset = 0; offset < block.data.length; offset += 4)
      assert.ok(Number.isFinite(block.data.readFloatLE(offset)), `${name}: finite output`);
    console.log(`PASS: installed ${metadata.name} (${metadata.inputs} in / ${metadata.outputs} out, ${metadata.latencyFrames} latency frames), real signal and silent-block processing.`);
  }
}

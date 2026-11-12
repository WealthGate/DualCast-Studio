/* global AudioWorkletProcessor, registerProcessor */
// The real-time thread never waits for Electron or native code. Every block has
// a fixed output deadline; a late reply uses the original samples at that same
// deadline, so a plugin cannot create silence, reorder audio or grow latency.
class NativePluginProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.frames = 512;
    this.delay = 2048;
    this.latency = 0;
    this.ringFrames = 16384;
    this.cursor = 0;
    this.dry = new Float32Array(this.ringFrames * 2);
    this.input = new Float32Array(this.frames * 2);
    this.replies = new Map();
    this.selected = null;
    this.stopped = false;
    this.enabled = false;
    this.port.onmessage = ({ data }) => {
      if (data.type === "stop") { this.stopped = true; this.replies.clear(); return; }
      if (data.type === "enabled") {
        this.enabled = data.value === true;
        if (Number.isInteger(data.latencyFrames) && data.latencyFrames >= 0 && data.latencyFrames <= 8192) this.latency = data.latencyFrames;
        this.replies.clear(); this.selected = null; return;
      }
      const earliest = Math.max(1, Math.floor((this.cursor - this.delay) / this.frames) + 1);
      const latest = Math.floor(this.cursor / this.frames);
      if (data.type === "output" && Number.isInteger(data.sequence) && data.sequence >= earliest && data.sequence <= latest &&
          data.samples instanceof Float32Array && data.samples.length === this.frames * 2 && this.replies.size < 8) {
        this.replies.set(data.sequence, data.samples);
      }
    };
  }
  process(inputs, outputs) {
    if (this.stopped) return false;
    const input = inputs[0] ?? [];
    const output = outputs[0];
    if (!output?.length) return true;
    for (let index = 0; index < output[0].length; index++, this.cursor++) {
      const offset = this.cursor % this.frames;
      const ring = (this.cursor % this.ringFrames) * 2;
      const left = input[0]?.[index] ?? 0;
      const right = input[1]?.[index] ?? left;
      this.dry[ring] = this.input[offset * 2] = Number.isFinite(left) ? left : 0;
      this.dry[ring + 1] = this.input[offset * 2 + 1] = Number.isFinite(right) ? right : 0;
      const read = this.cursor - this.delay;
      if (read >= 0) {
        const sequence = Math.floor(read / this.frames) + 1;
        const position = read % this.frames;
        if (position === 0) {
          this.selected = this.replies.get(sequence) ?? null;
          for (const key of this.replies.keys()) if (key <= sequence) this.replies.delete(key);
        }
        const dryFrame = read - this.latency;
        const dryIndex = (Math.max(0, dryFrame) % this.ringFrames) * 2;
        const dryLeft = dryFrame >= 0 ? this.dry[dryIndex] : 0;
        const dryRight = dryFrame >= 0 ? this.dry[dryIndex + 1] : 0;
        const sampleLeft = this.selected?.[position * 2] ?? dryLeft;
        const sampleRight = this.selected?.[position * 2 + 1] ?? dryRight;
        output[0][index] = Number.isFinite(sampleLeft) ? sampleLeft : dryLeft;
        if (output[1]) output[1][index] = Number.isFinite(sampleRight) ? sampleRight : dryRight;
      }
      if (offset === this.frames - 1) {
        const samples = this.input;
        if (this.enabled) {
          this.port.postMessage({ type: "input", sequence: Math.floor(this.cursor / this.frames) + 1, samples }, [samples.buffer]);
          this.input = new Float32Array(this.frames * 2);
        }
      }
    }
    return true;
  }
}
registerProcessor("openchurch-native-plugin", NativePluginProcessor);

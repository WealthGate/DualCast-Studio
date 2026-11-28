import { StringDecoder } from "string_decoder";

export const AUDIO_PLUGIN_MAGIC = 0x4f434156;
export const MAX_PLUGIN_PAYLOAD = 8192 * 2 * 4;

export const pluginPacket = (type: number, requestId = 0, payload: Uint8Array = new Uint8Array()) => {
  if (payload.byteLength > MAX_PLUGIN_PAYLOAD) throw new Error("Audio plugin packet is too large.");
  const buffer = Buffer.allocUnsafe(16 + payload.byteLength);
  buffer.writeUInt32LE(AUDIO_PLUGIN_MAGIC, 0);
  buffer.writeUInt32LE(type, 4);
  buffer.writeUInt32LE(requestId >>> 0, 8);
  buffer.writeUInt32LE(payload.byteLength, 12);
  buffer.set(payload, 16);
  return buffer;
};

// A child process can split or combine packets at any byte boundary. Bound both
// the advertised payload and pending bytes before allocating or accepting PCM.
export class AudioPluginPacketReader {
  private pending = Buffer.alloc(0);
  push(chunk: Uint8Array, receive: (id: number, samples: Float32Array) => void) {
    if (chunk.byteLength + this.pending.length > 1024 * 1024) throw new Error("Invalid audio plugin output size.");
    this.pending = Buffer.concat([this.pending, chunk]);
    while (this.pending.length >= 16) {
      const size = this.pending.readUInt32LE(12);
      if (this.pending.readUInt32LE(0) !== AUDIO_PLUGIN_MAGIC || this.pending.readUInt32LE(4) !== 1 ||
          size === 0 || size > MAX_PLUGIN_PAYLOAD || size % 8 !== 0) throw new Error("Invalid audio plugin output packet.");
      if (this.pending.length < 16 + size) return;
      const id = this.pending.readUInt32LE(8);
      const samples = new Float32Array(size / 4);
      for (let index = 0; index < samples.length; index++) {
        const value = this.pending.readFloatLE(16 + index * 4);
        samples[index] = Number.isFinite(value) ? value : 0;
      }
      receive(id, samples);
      this.pending = this.pending.subarray(16 + size);
    }
  }
}
// stderr also carries diagnostics from plug-ins and their dependencies. Keep
// those bounded without mistaking log text (or split UTF-8) for a host failure.
export class AudioPluginStatusReader {
  private decoder = new StringDecoder("utf8");
  private pending = "";
  private dropping = false;
  push(chunk: Buffer, receive: (event: Record<string, unknown>) => void) {
    const text = this.decoder.write(chunk);
    let start = 0;
    while (start < text.length) {
      const end = text.indexOf("\n", start);
      const part = text.slice(start, end < 0 ? text.length : end);
      if (!this.dropping) {
        if (this.pending.length + part.length > 65536) { this.pending = ""; this.dropping = true; }
        else this.pending += part;
      }
      if (end < 0) break;
      let event: unknown;
      if (!this.dropping) {
        try { event = JSON.parse(this.pending); } catch { /* Third-party diagnostic line. */ }
      }
      this.pending = ""; this.dropping = false;
      if (event && typeof event === "object" && !Array.isArray(event)) receive(event as Record<string, unknown>);
      start = end + 1;
    }
  }
}

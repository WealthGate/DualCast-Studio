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

import { describe, expect, it } from "vitest";
import { AudioPluginPacketReader, AudioPluginStatusReader, pluginPacket } from "../audioPluginProtocol";

describe("native plugin packet stream", () => {
  it("retains stereo sample order across split and combined child-process reads", () => {
    const values = new Float32Array([0.25, -0.75, 1.5, -2]);
    const packet = pluginPacket(1, 43, new Uint8Array(values.buffer));
    const received: { id: number; samples: number[] }[] = [];
    const reader = new AudioPluginPacketReader();
    const accept = (id: number, samples: Float32Array) => received.push({ id, samples: Array.from(samples) });
    reader.push(packet.subarray(0, 3), accept);
    reader.push(packet.subarray(3, 19), accept);
    expect(received).toEqual([]);
    reader.push(Buffer.concat([packet.subarray(19), packet]), accept);
    expect(received).toEqual([{ id: 43, samples: Array.from(values) }, { id: 43, samples: Array.from(values) }]);
  });

  it("rejects invalid or unbounded native output before allocating PCM", () => {
    const header = pluginPacket(1);
    header.writeUInt32LE(100_000_000, 12);
    expect(() => new AudioPluginPacketReader().push(header, () => undefined)).toThrow("Invalid audio");
    const malformed = pluginPacket(1, 1, new Uint8Array(7));
    expect(() => new AudioPluginPacketReader().push(malformed, () => undefined)).toThrow("Invalid audio");
  });
});

describe("native plugin status stream", () => {
  it("preserves split UTF-8 metadata and ignores third-party diagnostics and non-object JSON", () => {
    const reader = new AudioPluginStatusReader();
    const received: Record<string, unknown>[] = [];
    const event = { event: "ready", protocol: 1, name: "Réverb" };
    const bytes = Buffer.from('Dependency diagnostic\nnull\n[]\n' + JSON.stringify(event) + '\n');
    const split = bytes.indexOf(Buffer.from("é")) + 1;
    reader.push(bytes.subarray(0, split), value => received.push(value));
    expect(received).toEqual([]);
    reader.push(bytes.subarray(split), value => received.push(value));
    expect(received).toEqual([event]);
  });
  it("bounds oversized diagnostics and resumes at the next host status line", () => {
    const reader = new AudioPluginStatusReader();
    const received: Record<string, unknown>[] = [];
    const accept = (value: Record<string, unknown>) => received.push(value);
    reader.push(Buffer.alloc(65536, 120), accept);
    reader.push(Buffer.alloc(65536, 120), accept);
    reader.push(Buffer.from('\n{"event":"ready","protocol":1}\n'), accept);
    expect(received).toEqual([{ event: "ready", protocol: 1 }]);
  });
});

import { describe, expect, it } from "vitest";
import { AudioPluginPacketReader, pluginPacket } from "../audioPluginProtocol";

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

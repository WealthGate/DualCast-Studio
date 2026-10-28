import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

type Message = { type: string; sequence?: number; samples?: Float32Array; value?: boolean; latencyFrames?: number };
type Processor = { port: { onmessage: (event: { data: Message }) => void }; process: (inputs: Float32Array[][], outputs: Float32Array[][]) => boolean };
const setup = () => {
  let construct: new () => Processor;
  const packets: Message[] = [];
  class Base {
    port = { onmessage: (_event: { data: Message }) => undefined, postMessage: (data: Message) => packets.push(data) };
  }
  vm.runInNewContext(readFileSync("src/renderer/utils/audioPluginProcessor.js", "utf8"), {
    AudioWorkletProcessor: Base, Float32Array,
    registerProcessor: (_name: string, implementation: new () => Processor) => { construct = implementation; }
  });
  const processor = new construct!();
  const left: number[] = [], right: number[] = [];
  let clock = 0;
  const tick = (native: boolean) => {
    const source = new Float32Array(128);
    for (let index = 0; index < 128; index++) source[index] = (clock++ % 10007) / 10007;
    const result = [new Float32Array(128), new Float32Array(128)];
    processor.process([[source, source.map(value => -value)]], [result]);
    left.push(...result[0]); right.push(...result[1]);
    for (const packet of packets.splice(0)) if (native && packet.type === "input") {
      processor.port.onmessage({ data: { type: "output", sequence: packet.sequence, samples: packet.samples!.map(value => value * 0.5) } });
    }
  };
  return { processor, tick, left, right };
};

describe("live native plugin deadline and dry fallback", () => {
  it("processes stereo at one fixed delay and bypasses missing native replies without gaps or reordered samples", () => {
    const { processor, tick, left, right } = setup();
    processor.port.onmessage({ data: { type: "enabled", value: true, latencyFrames: 0 } });
    for (let step = 0; step < 80; step++) tick(true);
    for (let step = 0; step < 80; step++) tick(false);
    for (let index = 2048; index < 10000; index++) {
      expect(left[index]).toBe(Math.fround(Math.fround(((index - 2048) % 10007) / 10007) * 0.5));
      expect(right[index]).toBe(-left[index]);
    }
    for (let index = 12500; index < left.length; index++) {
      expect(left[index]).toBe(Math.fround(((index - 2048) % 10007) / 10007));
      expect(right[index]).toBe(-left[index]);
    }
  });

  it("retains plugin lookahead on dry fallback and bypass so A/V timing stays stable", () => {
    const { processor, tick, left } = setup();
    processor.port.onmessage({ data: { type: "enabled", value: true, latencyFrames: 1024 } });
    for (let step = 0; step < 80; step++) tick(false);
    processor.port.onmessage({ data: { type: "enabled", value: false } });
    for (let step = 0; step < 40; step++) tick(false);
    for (let index = 3072; index < left.length; index++) expect(left[index]).toBe(Math.fround(((index - 3072) % 10007) / 10007));
  });
});

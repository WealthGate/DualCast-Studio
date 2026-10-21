import { afterEach, describe, expect, it, vi } from "vitest";
import { createMediaInputQueue } from "../mediaInputQueue";
afterEach(() => vi.useRealTimers());
describe("destination input queues", () => {
  it("keeps healthy destinations moving while another destination is stalled", async () => {
    let release = () => {};
    const slowWrite = vi.fn(() => new Promise<void>(resolve => { release = resolve; }));
    const fastWrite = vi.fn(async (_data: Buffer) => {});
    const slow = createMediaInputQueue(slowWrite, vi.fn());
    const fast = createMediaInputQueue(fastWrite, vi.fn());
    for (let i = 0; i < 3; i++) { slow.enqueue(Buffer.from([i])); fast.enqueue(Buffer.from([i])); }
    await fast.drain();
    expect(fastWrite.mock.calls.map(args => args[0][0])).toEqual([0, 1, 2]);
    expect(slowWrite).toHaveBeenCalledOnce();
    slow.stop(); release(); await slow.drain();
  });
  it("rejects excessive byte/chunk backlog without discarding dependent chunks into a live decoder", async () => {
    const fail = vi.fn();
    const write = vi.fn(async () => {});
    const queue = createMediaInputQueue(write, fail);
    for (let i = 0; i < 10; i++) queue.enqueue(Buffer.alloc(1));
    await queue.drain();
    expect(fail).toHaveBeenCalledOnce();
    expect(write).not.toHaveBeenCalled();
    const bytes = createMediaInputQueue(write, fail);
    bytes.enqueue(Buffer.alloc(4 * 1024 * 1024 + 1));
    expect(fail).toHaveBeenCalledTimes(2);
  });
  it("does not replay stale media after a stall", async () => {
    vi.useFakeTimers();
    const write = vi.fn(async () => {}), fail = vi.fn();
    const queue = createMediaInputQueue(write, fail);
    queue.enqueue(Buffer.from([1]));
    vi.setSystemTime(Date.now() + 1600);
    await queue.drain();
    expect(write).not.toHaveBeenCalled();
    expect(fail.mock.calls[0][0].message).toContain("behind live");
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { createMediaInputQueue } from "../mediaInputQueue";
afterEach(() => vi.useRealTimers());
describe("destination input queues", () => {
  it("allows cold startup backlog and starts steady-state age accounting when output becomes live", async () => {
    vi.useFakeTimers(); let liveSince: number | null = null, release = () => {};
    let first = true;
    const write = vi.fn(() => {
      if(first){first=false;return new Promise<void>(resolve => {release=resolve;});}
      return Promise.resolve();
    });
    const fail = vi.fn(), queue = createMediaInputQueue(write, fail, 1024, { timeoutMs: 10000, liveSince: () => liveSince });
    for(let i=0;i<12;i++) queue.enqueue(Buffer.from([i]));
    await Promise.resolve(); vi.setSystemTime(Date.now()+4000);
    liveSince=Date.now(); release(); await queue.drain();
    expect(write).toHaveBeenCalledTimes(12); expect(fail).not.toHaveBeenCalled();
    queue.enqueue(Buffer.from([13])); vi.setSystemTime(Date.now()+1600); await queue.drain();
    expect(fail).toHaveBeenCalledOnce();
  });

  it("bounds startup queues instead of permitting unlimited buffering", async () => {
    const fail=vi.fn(), queue=createMediaInputQueue(async()=>{},fail,1024,{timeoutMs:10000,liveSince:()=>null});
    for(let i=0;i<49;i++) queue.enqueue(Buffer.from([i]));
    await queue.drain(); expect(fail).toHaveBeenCalledOnce();
  });
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

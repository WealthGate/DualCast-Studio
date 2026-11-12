import { afterEach, describe, expect, it, vi } from "vitest";
import { createLatestFrameRelay } from "../latestFrameRelay";
afterEach(() => vi.useRealTimers());
describe("projection IPC pacing", () => {
  it("does not base64-encode frames superseded during renderer backpressure", () => {
    const relay = createLatestFrameRelay(vi.fn());
    const skipped = vi.fn(() => "old"), latest = vi.fn(() => "latest");
    relay.offer("first"); relay.offer(skipped); relay.offer(latest);
    expect(skipped).not.toHaveBeenCalled(); expect(latest).not.toHaveBeenCalled();
    relay.acknowledge(1);
    expect(latest).toHaveBeenCalledOnce(); expect(skipped).not.toHaveBeenCalled();
  });
  it("retains only the latest frame while a display decodes and ignores stale acknowledgements", () => {
    const send = vi.fn(); const relay = createLatestFrameRelay(send);
    relay.offer("first"); relay.offer("old"); relay.offer("latest");
    expect(send).toHaveBeenCalledTimes(1);
    relay.acknowledge(0); expect(send).toHaveBeenCalledTimes(1);
    relay.acknowledge(1);
    expect(send.mock.lastCall?.[0]).toEqual({ sequence: 2, dataUrl: "latest" });
    relay.acknowledge(1); expect(send).toHaveBeenCalledTimes(2);
  });
  it("recovers when a display reloads without acknowledging its previous frame", () => {
    vi.useFakeTimers(); const send = vi.fn(); const relay = createLatestFrameRelay(send);
    relay.offer("before reload"); vi.advanceTimersByTime(1001); relay.offer("fresh");
    expect(send.mock.lastCall?.[0]).toEqual({ sequence: 2, dataUrl: "fresh" });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";
import { useConnectedDisplays } from "../useConnectedDisplays";
import type { ProjectionDisplay } from "../../../shared/types";

afterEach(() => vi.unstubAllGlobals());
describe("shared display discovery", () => {
  it("keeps the newest inventory when detection replies arrive out of order", async () => {
    const replies: ((value: ProjectionDisplay[]) => void)[] = [];
    vi.stubGlobal("window", { dualcast: { listProjectionDisplays: () => new Promise(resolve => replies.push(resolve)) } });
    const first = useConnectedDisplays.getState().refresh(), second = useConnectedDisplays.getState().refresh();
    const displays = [{ id: "2", name: "Projector", isPrimary: false, size: { width: 1920, height: 1080 } }];
    replies[1](displays); await second; replies[0]([]); await first;
    expect(useConnectedDisplays.getState()).toMatchObject({ displays, loading: false, error: null });
  });
  it("retains detected screens on a refresh failure and can recover", async () => {
    const displays = useConnectedDisplays.getState().displays;
    const list = vi.fn().mockRejectedValueOnce(Error("Detection failed")).mockResolvedValueOnce([]);
    vi.stubGlobal("window", { dualcast: { listProjectionDisplays: list } });
    await useConnectedDisplays.getState().refresh(); expect(useConnectedDisplays.getState()).toMatchObject({ displays, loading: false, error: "Detection failed" });
    await useConnectedDisplays.getState().refresh(); expect(useConnectedDisplays.getState()).toMatchObject({ displays: [], error: null });
  });
});

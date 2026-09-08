import { describe, expect, it, vi } from "vitest";
import { applyManualBlendInput } from "../transitions";

describe("Live Preview Blend input", () => {
  it("holds an intermediate blend without scheduling completion", () => {
    const setManualBlend = vi.fn();
    const completeManualBlend = vi.fn();
    const schedule = vi.fn();

    applyManualBlendInput(0.63, setManualBlend, completeManualBlend, schedule);

    expect(setManualBlend).toHaveBeenCalledWith(0.63);
    expect(schedule).not.toHaveBeenCalled();
    expect(completeManualBlend).not.toHaveBeenCalled();
  });

  it("defers endpoint completion so the native fader can visibly reset", () => {
    const setManualBlend = vi.fn();
    const completeManualBlend = vi.fn();
    let scheduled: (() => void) | null = null;

    applyManualBlendInput(1, setManualBlend, completeManualBlend, (callback) => {
      scheduled = callback;
    });

    expect(setManualBlend).toHaveBeenCalledWith(1);
    expect(completeManualBlend).not.toHaveBeenCalled();
    expect(scheduled).not.toBeNull();
    (scheduled as unknown as () => void)();
    expect(completeManualBlend).toHaveBeenCalledOnce();
  });
});

import { describe, expect, it, vi } from "vitest";
import { applyManualBlendInput, createManualBlendGesture, sceneTransitions } from "../transitions";

describe("Live Preview Blend input", () => {
  it("completes only once while the same drag keeps hitting 100%", () => {
    const set = vi.fn(), complete = vi.fn();
    const gesture = createManualBlendGesture(set, complete);
    gesture.begin();
    [0.4, 0.8, 1, 1, 0.98, 1].forEach(gesture.input);
    expect(complete).toHaveBeenCalledOnce();
    expect(set.mock.calls.map(([value]) => value)).toEqual([0.4, 0.8, 1]);
    gesture.begin(); gesture.input(0.5); gesture.input(1);
    expect(complete).toHaveBeenCalledTimes(2);
  });
  it("provides distinct buttons for the original and new scene effects", () => {
    expect(sceneTransitions.map(transition => transition.type)).toEqual(["cut", "fade", "crossfade", "wipe-left", "wipe-right", "slide-left", "slide-right", "zoom", "iris"]);
  });
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

import type { LowerThirdSlide } from "../../shared/types";

export type TextMode = "show" | "hide" | "theme" | "logo";
export type LowerThirdCue = {
  previous: LowerThirdSlide | null; current: LowerThirdSlide | null;
  previousMode: TextMode; mode: TextMode; changedAt: number;
};
export const emptyLowerThirdCue = (): LowerThirdCue => ({ previous: null, current: null, previousMode: "show", mode: "show", changedAt: -Infinity });
export const updateLowerThirdCue = (cue: LowerThirdCue, next: LowerThirdSlide | null, mode: TextMode, now: number): LowerThirdCue =>
  !cue.current && !next ? { ...cue, mode }
    : cue.current?.id === next?.id && cue.mode === mode ? { ...cue, current: next }
    : { previous: cue.current, current: next, previousMode: cue.mode, mode, changedAt: now };

export const createVisibilityTransition = () => {
  let from = 1, target = 1, changedAt = -Infinity, duration = 450;
  const value = (now: number) => {
    const progress = Math.min(1, Math.max(0, (now - changedAt) / duration));
    return from + (target - from) * progress * progress * (3 - 2 * progress);
  };
  return {
    value,
    active: (now: number, finalFrameAllowance = 0) => now - changedAt < duration + finalFrameAllowance,
    set: (visible: boolean, now: number, milliseconds: number) => {
      if (target === Number(visible)) return;
      from = value(now); target = Number(visible); changedAt = now;
      duration = Math.max(1, milliseconds);
    }
  };
};

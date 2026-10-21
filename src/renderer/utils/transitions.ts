type ScheduleTransitionCompletion = (callback: () => void) => void;

const scheduleNextUiTick: ScheduleTransitionCompletion = (callback) => {
  window.setTimeout(callback, 0);
};

export const applyManualBlendInput = (
  value: number,
  setManualBlend: (value: number) => void,
  completeManualBlend: () => void,
  schedule: ScheduleTransitionCompletion = scheduleNextUiTick
) => {
  const normalized = Math.max(0, Math.min(1, value));
  setManualBlend(normalized);
  if (normalized === 1) schedule(completeManualBlend);
};
import { SceneTransitionType } from "../../shared/types";

export const sceneTransitions: { type: SceneTransitionType; label: string; description: string }[] = [
  { type: "cut", label: "Cut", description: "Switch instantly to Preview." },
  { type: "fade", label: "Fade", description: "A softly eased dissolve between pictures." },
  { type: "crossfade", label: "Crossfade", description: "A steady dissolve between pictures." },
  { type: "wipe-left", label: "Wipe Left", description: "Reveal Preview from right to left." },
  { type: "wipe-right", label: "Wipe Right", description: "Reveal Preview from left to right." },
  { type: "slide-left", label: "Slide Left", description: "Glide Preview in from the right." },
  { type: "slide-right", label: "Slide Right", description: "Glide Preview in from the left." },
  { type: "zoom", label: "Soft Zoom", description: "Gently enlarge and dissolve into Preview." },
  { type: "iris", label: "Iris Reveal", description: "Open a circular reveal from the center." }
];

export const drawSceneTransition = (
  ctx: CanvasRenderingContext2D, outgoing: CanvasImageSource, incoming: CanvasImageSource,
  type: SceneTransitionType, progress: number, width: number, height: number
) => {
  const p = Math.max(0, Math.min(1, progress));
  const eased = p * p * (3 - 2 * p);
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.drawImage(type === "cut" || p === 1 ? incoming : outgoing, 0, 0, width, height);
  if (p > 0 && p < 1 && type !== "cut") {
    if (type === "wipe-left" || type === "wipe-right") {
      ctx.beginPath();
      ctx.rect(type === "wipe-left" ? width * (1 - eased) : 0, 0, width * eased, height);
      ctx.clip();
    } else if (type === "iris") {
      ctx.beginPath();
      ctx.arc(width / 2, height / 2, Math.hypot(width, height) / 2 * eased, 0, 2 * Math.PI);
      ctx.clip();
    }
    if (type === "slide-left" || type === "slide-right") {
      ctx.drawImage(incoming, (type === "slide-left" ? 1 : -1) * width * (1 - eased), 0, width, height);
    } else if (type === "zoom") {
      const scale = 0.92 + 0.08 * eased;
      ctx.globalAlpha = eased;
      ctx.drawImage(incoming, width * (1 - scale) / 2, height * (1 - scale) / 2, width * scale, height * scale);
    } else {
      if (type === "crossfade" || type === "fade") ctx.globalAlpha = type === "fade" ? eased : p;
      ctx.drawImage(incoming, 0, 0, width, height);
    }
  }
  ctx.restore();
};


// A range input keeps producing events while held at its endpoint. Completing
// more than once swaps the scenes back and forth and flashes the live picture.
export const createManualBlendGesture = (setBlend: (value: number) => void, complete: () => void) => {
  let completed = false;
  return {
    begin: () => { completed = false; },
    isComplete: () => completed,
    input: (value: number) => {
      if (completed) return;
      if (value >= 1) completed = true;
      applyManualBlendInput(value, setBlend, complete, callback => callback());
    }
  };
};

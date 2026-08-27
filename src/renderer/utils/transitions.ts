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

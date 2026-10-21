// Keep the original frame phase instead of resetting the clock at every draw.
// Rounding at 60 Hz must not turn a requested 30 fps into alternating 20/30 fps.
export const createFrameCadence = (fps: number) => {
  const interval = 1000 / Math.max(1, fps);
  let nextAt: number | null = null;
  return (now: number) => {
    if (nextAt === null) { nextAt = now + interval; return true; }
    if (now + 0.5 < nextAt) return false;
    nextAt += interval * (Math.floor((Math.max(0, now - nextAt) + 0.5) / interval) + 1);
    return true;
  };
};

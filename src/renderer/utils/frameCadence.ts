// Keep the original frame phase instead of resetting the clock at every draw.
// Rounding at 60 Hz must not turn a requested 30 fps into alternating 20/30 fps.
export const createFrameCadence = (fps: number) => {
  const interval = 1000 / Math.max(1, fps);
  const tolerance = interval / 4;
  let nextAt: number | null = null;
  return (now: number) => {
    if (nextAt === null) { nextAt = now + interval; return true; }
    if (now + tolerance < nextAt) return false;
    nextAt += interval * (Math.floor(Math.max(0, now + tolerance - nextAt) / interval) + 1);
    return true;
  };
};

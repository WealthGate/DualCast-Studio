// Don't redraw a high-resolution bitmap when none of its pixels changed. A
// small heartbeat preserves media timestamps and display liveness for stills.
export const createFrameInvalidation = (heartbeatMs = 250) => {
  let previous: readonly unknown[] = [];
  let lastDraw = -Infinity;
  return (state: readonly unknown[], now: number, animated = false) => {
    const changed = state.length !== previous.length || state.some((value, index) => value !== previous[index]);
    if (!changed && !animated && now - lastDraw < heartbeatMs) return false;
    previous = state; lastDraw = now; return true;
  };
};

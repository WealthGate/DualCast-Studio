type Listener = (now: number) => void;
const listeners = new WeakMap<HTMLCanvasElement, Map<Listener, number>>();
export const onCanvasFrame = (canvas: HTMLCanvasElement, listener: Listener, fps = 0) => {
  const entries = listeners.get(canvas) ?? new Map<Listener, number>();
  entries.set(listener, fps); listeners.set(canvas, entries);
  return () => { entries.delete(listener); if (!entries.size) listeners.delete(canvas); };
};
export const requestedCanvasFrameRate = (canvas: HTMLCanvasElement) => Math.max(0, ...(listeners.get(canvas)?.values() ?? []));
export const publishCanvasFrame = (canvas: HTMLCanvasElement, now: number) => {
  listeners.get(canvas)?.forEach((_fps, listener) => listener(now));
};

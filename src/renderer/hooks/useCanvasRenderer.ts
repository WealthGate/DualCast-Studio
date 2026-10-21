import { RefObject, useEffect, useLayoutEffect, useRef } from "react";

export const resizeCanvas = (canvas: HTMLCanvasElement, width: number, height: number) => {
  // Assigning even the SAME dimensions clears the backing bitmap and resets
  // captureStream. Only resize when the output resolution actually changes.
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
};

export const useCanvasRenderer = (
  canvasRef: RefObject<HTMLCanvasElement>, width: number, height: number,
  fps: number, draw: (context: CanvasRenderingContext2D, now: number) => void,
  enabled = true, frozen = false
) => {
  const drawRef = useRef(draw);
  useLayoutEffect(() => { drawRef.current = draw; });
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enabled) return;
    resizeCanvas(canvas, width, height);
    const context = canvas.getContext("2d");
    if (!context) return;
    let frame = 0;
    let last = -Infinity;
    const render = (now: number) => {
      if (!frozen && now - last >= 1000 / Math.max(1, fps)) {
        last = now;
        drawRef.current(context, now);
      }
      frame = requestAnimationFrame(render);
    };
    frame = requestAnimationFrame(render);
    return () => cancelAnimationFrame(frame);
  }, [canvasRef, enabled, fps, frozen, height, width]);
};

import { RefObject, useEffect, useLayoutEffect, useRef } from "react";
import { publishCanvasFrame, requestedCanvasFrameRate } from "../utils/canvasFrames";

export const resizeCanvas = (canvas: HTMLCanvasElement, width: number, height: number) => {
  // Assigning even the SAME dimensions clears the backing bitmap and resets
  // captureStream. Only resize when the output resolution actually changes.
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;
};

export const useCanvasRenderer = (
  canvasRef: RefObject<HTMLCanvasElement>, width: number, height: number,
  fps: number, draw: (context: CanvasRenderingContext2D, now: number) => void | boolean,
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
    let timer = 0;
    let activeFps = fps;
    let nextAt = performance.now();
    const render = () => {
      const now = performance.now();
      const requiredFps = Math.max(fps, requestedCanvasFrameRate(canvas));
      if (requiredFps !== activeFps) { activeFps = requiredFps; nextAt = now; }
      const interval = 1000 / Math.max(1, activeFps);
      try {
        if (now + 0.5 >= nextAt) {
          nextAt += interval * (Math.floor(Math.max(0, now - nextAt) / interval) + 1);
          const changed = !frozen && drawRef.current(context, now) !== false;
          // Capture has a media clock even when the bitmap is unchanged. Without
          // these frames, audio piles up in the muxer until the next picture.
          if (changed || requestedCanvasFrameRate(canvas) > 0) publishCanvasFrame(canvas, now);
        }
      } finally {
        // Program must keep its clock when the operator's monitor refreshes
        // more slowly than the sanctuary display or requested stream FPS.
        timer = window.setTimeout(render, Math.max(1, nextAt - performance.now()));
      }
    };
    timer = window.setTimeout(render, 0);
    return () => window.clearTimeout(timer);
  }, [canvasRef, enabled, fps, frozen, height, width]);
};

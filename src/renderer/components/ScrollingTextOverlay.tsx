import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollingTextRenderer, ScrollingTextSource } from "../utils/scrollingText";
import { useCanvasRenderer } from "../hooks/useCanvasRenderer";

const ScrollingTextOverlay: React.FC<{ sources: ScrollingTextSource[]; showText: boolean; frameRate?: number }> = ({ sources, showText, frameRate = 30 }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ width: 1, height: 1 });
  const renderer = useMemo(() => new ScrollingTextRenderer(), []);
  useEffect(() => { renderer.prune(sources); }, [renderer, sources]);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => { const rect = canvas.getBoundingClientRect(); setSize({ width: Math.max(1, Math.round(rect.width)), height: Math.max(1, Math.round(rect.height)) }); };
    const observer = new ResizeObserver(resize); observer.observe(canvas); resize();
    return () => observer.disconnect();
  }, []);
  useCanvasRenderer(canvasRef, size.width, size.height, frameRate, (ctx, now) => {
    ctx.clearRect(0, 0, size.width, size.height);
    sources.forEach(source => renderer.draw(ctx, source, size.width, size.height, now, showText));
  });
  return <canvas ref={canvasRef} className="scrolling-text-overlay" aria-hidden="true" />;
};
export default ScrollingTextOverlay;

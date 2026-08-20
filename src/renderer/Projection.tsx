import React, { useEffect, useRef, useState } from "react";
import { ProgramState } from "../shared/types";

const defaultState: ProgramState = {
  programSceneId: null,
  isCutToBlack: false,
  isFrozen: false,
  qualityPreset: "medium"
};

type ProjectionProps = {
  mode?: "program" | "lower-third";
};

const Projection: React.FC<ProjectionProps> = ({ mode = "program" }) => {
  const [programState, setProgramState] = useState<ProgramState>(defaultState);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const latestFrameRef = useRef<HTMLImageElement | null>(null);
  const drawFrameRef = useRef<() => void>(() => undefined);

  useEffect(() => {
    document.body.classList.add("projection-mode");
    document.body.classList.toggle("projection-lower-third-mode", mode === "lower-third");
    return () => {
      document.body.classList.remove("projection-mode");
      document.body.classList.remove("projection-lower-third-mode");
    };
  }, [mode]);

  useEffect(() => {
    const unsubscribe = window.dualcast.onProgramState((state) => setProgramState(state));
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const subscribe = mode === "lower-third" ? window.dualcast.onLowerThirdFrame : window.dualcast.onProgramFrame;
    const unsubscribe = subscribe((dataUrl) => {
      const img = new Image();
      img.onload = () => {
        latestFrameRef.current = img;
        drawFrameRef.current();
      };
      img.src = dataUrl;
    });

    return () => {
      unsubscribe();
    };
  }, [mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const resize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      drawFrameRef.current();
    };

    resize();
    window.addEventListener("resize", resize);

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return () => {
        window.removeEventListener("resize", resize);
      };
    }

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (mode === "lower-third") {
        if (!programState.isCutToBlack && latestFrameRef.current) {
          ctx.drawImage(latestFrameRef.current, 0, 0, canvas.width, canvas.height);
        }
      } else if (programState.isCutToBlack || !programState.programSceneId) {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else if (latestFrameRef.current) {
        ctx.drawImage(latestFrameRef.current, 0, 0, canvas.width, canvas.height);
      }
    };

    drawFrameRef.current = render;
    render();

    return () => {
      drawFrameRef.current = () => undefined;
      window.removeEventListener("resize", resize);
    };
  }, [mode, programState.isCutToBlack, programState.programSceneId]);

  return (
    <div className="projection-root">
      <canvas ref={canvasRef} className="projection-canvas" />
    </div>
  );
};

export default Projection;

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
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    document.body.classList.add("projection-mode");
    return () => {
      document.body.classList.remove("projection-mode");
    };
  }, []);

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
      if (programState.isCutToBlack || !programState.programSceneId) {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else if (latestFrameRef.current) {
        ctx.drawImage(latestFrameRef.current, 0, 0, canvas.width, canvas.height);
      }

      if (!programState.isFrozen) {
        rafRef.current = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
      window.removeEventListener("resize", resize);
    };
  }, [programState.isCutToBlack, programState.isFrozen, programState.programSceneId]);

  return (
    <div className="projection-root">
      <canvas ref={canvasRef} className="projection-canvas" />
    </div>
  );
};

export default Projection;

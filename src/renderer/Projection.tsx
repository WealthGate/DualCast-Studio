import SanctuaryLayout from "./components/SanctuaryLayout";
import React, { useEffect, useRef, useState } from "react";
import { ProgramState } from "../shared/types";
import { resizeCanvas } from "./hooks/useCanvasRenderer";
import { createFrameDecoder } from "./utils/frameDecoder";
import { applyProjectionSignal, localProjectionDescription } from "./utils/projectionPeer";

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoReady, setVideoReady] = useState(false);
  const videoReadyRef = useRef(false);
  videoReadyRef.current = videoReady;
  const independent = programState.sanctuary?.settings.mode === "independent";

  useEffect(() => {
    if (mode !== "program" || independent) return;
    let peer: RTCPeerConnection | null = null;
    let active = true;
    const createPeer = () => {
      const connection = new RTCPeerConnection({ iceServers: [] });
      connection.onicecandidate = event => { if (event.candidate) window.dualcast.sendProjectionSignal({ type: "candidate", candidate: event.candidate.toJSON() }); };
      connection.ontrack = event => {
        const video = videoRef.current;
        if (video) { video.srcObject = event.streams[0]; void video.play().catch(() => setVideoReady(false)); }
      };
      connection.onconnectionstatechange = () => {
        setVideoReady(connection.connectionState === "connected" && (videoRef.current?.readyState ?? 0) >= 2);
      };
      return connection;
    };
    const unsubscribe = window.dualcast.onProjectionSignal(signal => {
      if (signal.type === "offer" && signal.description) {
        peer?.close(); setVideoReady(false); peer = createPeer();
        const connection = peer;
        void applyProjectionSignal(connection, signal).then(async () => {
          await connection.setLocalDescription(localProjectionDescription(await connection.createAnswer()));
          if (active && peer === connection) window.dualcast.sendProjectionSignal({ type: "answer", description: connection.localDescription!.toJSON() });
        }).catch(() => setVideoReady(false));
      } else if (signal.type === "candidate" && peer) void applyProjectionSignal(peer, signal).catch(() => undefined);
    });
    window.dualcast.sendProjectionSignal({ type: "ready" });
    return () => { active = false; unsubscribe(); peer?.close(); setVideoReady(false); const video = videoRef.current; if (video) video.srcObject = null; window.dualcast.sendProjectionSignal({ type: "closed" }); };
  }, [mode, independent]);

  useEffect(() => {
    document.body.classList.add("projection-mode");
    document.body.classList.toggle("projection-lower-third-mode", mode === "lower-third");
    return () => {
      document.body.classList.remove("projection-mode");
      document.body.classList.remove("projection-lower-third-mode");
    };
  }, [mode]);

  useEffect(() => {
    let active = true;
    let receivedUpdate = false;
    const unsubscribe = window.dualcast.onProgramState((state) => {
      receivedUpdate = true;
      setProgramState(state);
    });
    void window.dualcast.getProgramState().then((state) => {
      if (active && !receivedUpdate && state) setProgramState(state);
    }).catch(() => undefined);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const subscribe = mode === "lower-third" ? window.dualcast.onLowerThirdFrame : window.dualcast.onProgramFrame;
    const decoder = createFrameDecoder((image) => {
      latestFrameRef.current = image;
      drawFrameRef.current();
    });
    const unsubscribe = subscribe(frame => mode === "program" && videoReadyRef.current ? Promise.resolve() : decoder.decode(frame));

    return () => {
      unsubscribe();
      decoder.stop();
    };
  }, [mode]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const resize = () => {
      resizeCanvas(canvas, window.innerWidth, window.innerHeight);
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
  }, [mode, programState.isCutToBlack, programState.programSceneId, programState.sanctuary?.settings.mode]);

  if (mode === "program" && programState.sanctuary?.settings.mode === "independent") {
    return <SanctuaryLayout state={programState.sanctuary} black={programState.isCutToBlack} frameRate={programState.frameRate} />;
  }

  return (
    <div className="projection-root">
      <canvas ref={canvasRef} className="projection-canvas" style={{ visibility: videoReady ? "hidden" : "visible" }} />
      {mode === "program" && <video ref={videoRef} autoPlay muted playsInline className="projection-video" onPlaying={() => setVideoReady(true)} style={{ visibility: videoReady && !programState.isCutToBlack && Boolean(programState.programSceneId) ? "visible" : "hidden" }} />}
    </div>
  );
};

export default Projection;

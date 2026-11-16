import SanctuaryLayout from "./components/SanctuaryLayout";
import React, { useEffect, useRef, useState } from "react";
import { ProgramState } from "../shared/types";
import { resizeCanvas } from "./hooks/useCanvasRenderer";
import { createFrameDecoder, DecodedFrame } from "./utils/frameDecoder";
import { applyProjectionSignal, localProjectionDescription } from "./utils/projectionPeer";
import { createVideoFrameDecoder } from "./utils/videoFrameDecoder";

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
  const latestFrameRef = useRef<DecodedFrame | HTMLCanvasElement | null>(null);
  const encodedAtRef = useRef(-Infinity);
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
    let frames = 0;
    let lastFrameAt = performance.now();
    let lastRetryAt = -Infinity;
    const createPeer = () => {
      const connection = new RTCPeerConnection({ iceServers: [] });
      connection.onicecandidate = event => { if (event.candidate) window.dualcast.sendProjectionSignal({ type: "candidate", candidate: event.candidate.toJSON() }); };
      connection.ontrack = event => {
        if (!active || peer !== connection) return;
        const video = videoRef.current;
        if (video) { video.srcObject = event.streams[0]; void video.play().catch(() => setVideoReady(false)); }
      };
      connection.onconnectionstatechange = () => {
        if (active && peer === connection && connection.connectionState !== "connected") setVideoReady(false);
      };
      return connection;
    };
    const unsubscribe = window.dualcast.onProjectionSignal(signal => {
      if (signal.type === "offer" && signal.description) {
        peer?.close(); setVideoReady(false); peer = createPeer();
        frames = 0; lastFrameAt = performance.now();
        const connection = peer;
        void applyProjectionSignal(connection, signal).then(async () => {
          await connection.setLocalDescription(localProjectionDescription(await connection.createAnswer()));
          if (active && peer === connection) window.dualcast.sendProjectionSignal({ type: "answer", description: connection.localDescription!.toJSON() });
        }).catch(() => { if (active && peer === connection) setVideoReady(false); });
      } else if (signal.type === "candidate" && peer) void applyProjectionSignal(peer, signal).catch(() => undefined);
    });
    // "connected" only describes signaling/transport. A connected decoder can
    // still stop producing pictures. Recover that case instead of hiding the
    // fallback canvas forever behind a stalled video frame.
    const watchdog = window.setInterval(() => {
      const video = videoRef.current;
      const decoded = video?.getVideoPlaybackQuality().totalVideoFrames ?? 0;
      const now = performance.now();
      if(now-encodedAtRef.current<750)return;
      if (decoded !== frames && video && video.readyState >= 2 && peer?.connectionState === "connected") {
        frames = decoded; lastFrameAt = now; setVideoReady(true);
      } else if (now - lastFrameAt > 750) {
        if (videoReadyRef.current && video && video.readyState >= 2) {
          const canvas = canvasRef.current;
          if (canvas) canvas.getContext("2d")?.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
        setVideoReady(false);
        if (now - lastRetryAt > 2000) {
          lastRetryAt = now;
          window.dualcast.sendProjectionSignal({ type: "ready" });
        }
      }
    }, 250);
    window.dualcast.sendProjectionSignal({ type: "ready" });
    return () => { active = false; window.clearInterval(watchdog); unsubscribe(); peer?.close(); setVideoReady(false); const video = videoRef.current; if (video) video.srcObject = null; window.dualcast.sendProjectionSignal({ type: "closed" }); };
  }, [mode, independent]);

  useEffect(()=>{
    if(mode!=="program"||independent)return;
    const buffer=document.createElement("canvas"),context=buffer.getContext("2d",{alpha:false});
    const decoder=createVideoFrameDecoder(frame=>{
      if(!context)return;
      resizeCanvas(buffer,frame.displayWidth,frame.displayHeight);context.drawImage(frame,0,0);
      latestFrameRef.current=buffer;encodedAtRef.current=performance.now();setVideoReady(false);drawFrameRef.current();
    },()=>{encodedAtRef.current=-Infinity;window.dualcast.sendProjectionSignal({type:"fallback"});});
    const off=window.dualcast.onProgramVideoFrame(frame=>decoder.decode(frame));
    return()=>{off();decoder.stop();encodedAtRef.current=-Infinity;if(latestFrameRef.current===buffer)latestFrameRef.current=null;};
  },[mode,independent]);

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
    const unsubscribe = subscribe(frame => mode === "program" && (videoReadyRef.current || performance.now()-encodedAtRef.current<750) ? Promise.resolve() : decoder.decode(frame));

    return () => {
      unsubscribe();
      latestFrameRef.current = null;
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
    return <SanctuaryLayout state={programState.sanctuary} black={programState.isCutToBlack} frozen={programState.isFrozen} frameRate={programState.frameRate} />;
  }

  return (
    <div className="projection-root">
      <canvas ref={canvasRef} className="projection-canvas" style={{ visibility: videoReady ? "hidden" : "visible" }} />
      {mode === "program" && <video ref={videoRef} autoPlay muted playsInline className="projection-video" style={{ visibility: videoReady && !programState.isCutToBlack && Boolean(programState.programSceneId) ? "visible" : "hidden" }} />}
    </div>
  );
};

export default Projection;

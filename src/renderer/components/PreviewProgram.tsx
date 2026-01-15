import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { getCameraStream, getMediaStream, parseCameraSourceId, stopMediaStream } from "../utils/media";
import { fitToBounds, getQualityProfile } from "../../shared/recording";

type PreviewProgramProps = {
  previewVideoRef: React.RefObject<HTMLVideoElement>;
  programVideoRef: React.RefObject<HTMLVideoElement>;
  programCanvasRef: React.RefObject<HTMLCanvasElement>;
};

const PreviewProgram: React.FC<PreviewProgramProps> = ({ previewVideoRef, programVideoRef, programCanvasRef }) => {
  const {
    previewSourceId,
    programSourceId,
    isCutToBlack,
    isFrozen,
    takeToProgram,
    cutToBlack,
    clearCutToBlack,
    toggleFreeze,
    settings,
    displays,
    cameraDeviceId,
    cameraOverlayMode,
    cameraRect
  } = useAppStore();

  const [projectionTargetId, setProjectionTargetId] = useState<string>("");
  const [isProjecting, setIsProjecting] = useState(false);
  const screenTargets = useMemo(
    () => displays.filter((display) => display.sourceType === "screen" && display.displayId),
    [displays]
  );

  const previewStreamRef = useRef<MediaStream | null>(null);
  const programStreamRef = useRef<MediaStream | null>(null);
  const cameraStreamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const cameraVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const loadPreview = async () => {
      stopMediaStream(previewStreamRef.current);
      if (!previewSourceId || !previewVideoRef.current) {
        return;
      }
      try {
        const stream = await getMediaStream(previewSourceId, false);
        previewStreamRef.current = stream;
        previewVideoRef.current.srcObject = stream;
        previewVideoRef.current.play();
      } catch {
        // Ignore preview failures; user can retry.
      }
    };

    loadPreview();

    return () => {
      stopMediaStream(previewStreamRef.current);
    };
  }, [previewSourceId, previewVideoRef]);

  useEffect(() => {
    const loadProgram = async () => {
      stopMediaStream(programStreamRef.current);
      if (!programSourceId || !programVideoRef.current) {
        return;
      }
      try {
        const stream = await getMediaStream(programSourceId, false);
        programStreamRef.current = stream;
        programVideoRef.current.srcObject = stream;
        programVideoRef.current.play();
      } catch {
        // Ignore program failures; user can retry.
      }
    };

    loadProgram();

    return () => {
      stopMediaStream(programStreamRef.current);
    };
  }, [programSourceId, programVideoRef]);

  useEffect(() => {
    const loadCamera = async () => {
      stopMediaStream(cameraStreamRef.current);
      if (!cameraDeviceId || cameraOverlayMode === "none") {
        return;
      }

      const programCameraId = programSourceId ? parseCameraSourceId(programSourceId) : null;
      if (programCameraId && programCameraId === cameraDeviceId) {
        return;
      }

      try {
        const stream = await getCameraStream(cameraDeviceId);
        cameraStreamRef.current = stream;
        if (cameraVideoRef.current) {
          cameraVideoRef.current.srcObject = stream;
          cameraVideoRef.current.play();
        }
      } catch {
        // Ignore camera load failures; user can retry.
      }
    };

    loadCamera();

    return () => {
      stopMediaStream(cameraStreamRef.current);
    };
  }, [cameraDeviceId, cameraOverlayMode, programSourceId]);

  useEffect(() => {
    const canvas = programCanvasRef.current;
    const programVideo = programVideoRef.current;
    if (!canvas || !programVideo) {
      return;
    }

    const programCameraId = programSourceId ? parseCameraSourceId(programSourceId) : null;
    const overlayMode = cameraOverlayMode;
    const cameraVideo = cameraVideoRef.current ?? null;

    const getBaseVideo = () => {
      if (overlayMode === "program-over-camera") {
        if (cameraVideo && cameraVideo.readyState >= 2) {
          return cameraVideo;
        }
        if (programCameraId && programVideo.readyState >= 2) {
          return programVideo;
        }
      }
      return programVideo.readyState >= 2 ? programVideo : null;
    };

    const updateCanvasSize = () => {
      const baseVideo = getBaseVideo();
      if (!baseVideo) {
        return;
      }
      const profile = getQualityProfile(settings.qualityPreset);
      const target = fitToBounds(baseVideo.videoWidth || 1920, baseVideo.videoHeight || 1080, profile.maxWidth, profile.maxHeight);
      canvas.width = target.width;
      canvas.height = target.height;
    };

    if (programVideo.readyState >= 2) {
      updateCanvasSize();
    } else {
      programVideo.onloadedmetadata = updateCanvasSize;
    }

    if (cameraVideo && cameraVideo.readyState < 2) {
      cameraVideo.onloadedmetadata = updateCanvasSize;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const drawOverlay = (video: HTMLVideoElement) => {
      const rect = {
        x: (cameraRect.x / 100) * canvas.width,
        y: (cameraRect.y / 100) * canvas.height,
        width: (cameraRect.width / 100) * canvas.width,
        height: (cameraRect.height / 100) * canvas.height
      };
      ctx.drawImage(video, rect.x, rect.y, rect.width, rect.height);
    };

    const render = () => {
      if (isCutToBlack) {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else {
        const baseVideo = getBaseVideo();
        if (baseVideo) {
          ctx.drawImage(baseVideo, 0, 0, canvas.width, canvas.height);
        }

        if (overlayMode === "camera-over-program" && cameraVideo && cameraVideo.readyState >= 2) {
          if (!programCameraId || programCameraId !== cameraDeviceId) {
            drawOverlay(cameraVideo);
          }
        }

        if (overlayMode === "program-over-camera" && programVideo.readyState >= 2) {
          drawOverlay(programVideo);
        }
      }

      if (!isFrozen) {
        rafRef.current = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [
    programSourceId,
    programCanvasRef,
    programVideoRef,
    isCutToBlack,
    isFrozen,
    settings.qualityPreset,
    cameraOverlayMode,
    cameraRect,
    cameraDeviceId
  ]);

  useEffect(() => {
    if (!projectionTargetId && screenTargets.length > 0) {
      setProjectionTargetId(String(screenTargets[0].displayId));
    }
  }, [projectionTargetId, screenTargets]);

  useEffect(() => {
    const unsubscribeOpen = window.dualcast.onProjectionOpened(() => setIsProjecting(true));
    const unsubscribeClose = window.dualcast.onProjectionClosed(() => setIsProjecting(false));

    return () => {
      unsubscribeOpen();
      unsubscribeClose();
    };
  }, []);

  const handleProjectionToggle = async () => {
    if (isProjecting) {
      await window.dualcast.closeProjection();
      setIsProjecting(false);
      return;
    }

    const target = projectionTargetId || null;
    await window.dualcast.openProjection(target);
    setIsProjecting(true);
  };

  return (
    <section className="preview-program">
      <div className="pane">
        <div className="pane-header">
          <h2>Preview</h2>
          <span className="tag">Select a source</span>
        </div>
        <div className="pane-body">
          <video ref={previewVideoRef} muted playsInline className="video-surface" />
        </div>
      </div>
      <div className="pane">
        <div className="pane-header program-header">
          <h2>Program</h2>
          <span className={isCutToBlack ? "tag alert" : "tag"}>{isCutToBlack ? "BLACK" : "LIVE"}</span>
        </div>
        <div className="pane-body">
          <canvas ref={programCanvasRef} className="video-surface" />
          <video ref={programVideoRef} muted playsInline className="hidden" />
          <video ref={cameraVideoRef} muted playsInline className="hidden" />
        </div>
        <div className="pane-controls">
          <button className="btn btn-primary" onClick={takeToProgram} disabled={!previewSourceId}>
            TAKE
          </button>
          <button className="btn btn-outline" onClick={isCutToBlack ? clearCutToBlack : cutToBlack}>
            CUT TO BLACK
          </button>
          <button className="btn btn-outline" onClick={toggleFreeze}>
            {isFrozen ? "UNFREEZE" : "FREEZE"}
          </button>
        </div>
        <div className="projection-row">
          <label htmlFor="projectionDisplay">Project to</label>
          <select
            id="projectionDisplay"
            value={projectionTargetId}
            onChange={(event) => setProjectionTargetId(event.target.value)}
            disabled={screenTargets.length === 0}
          >
            {screenTargets.map((display) => (
              <option key={display.displayId ?? display.id} value={String(display.displayId)}>
                {display.name} ({display.size.width} x {display.size.height})
              </option>
            ))}
          </select>
          <button className="btn btn-outline" onClick={handleProjectionToggle} disabled={!programSourceId || screenTargets.length === 0}>
            {isProjecting ? "Stop Projection" : "Project Program"}
          </button>
        </div>
      </div>
    </section>
  );
};

export default PreviewProgram;

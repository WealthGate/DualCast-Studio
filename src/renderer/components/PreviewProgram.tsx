import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { getDisplayStream, stopMediaStream } from "../utils/media";
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
    displays
  } = useAppStore();

  const [projectionTargetId, setProjectionTargetId] = useState<string>("");
  const [isProjecting, setIsProjecting] = useState(false);
  const screenTargets = useMemo(
    () => displays.filter((display) => display.sourceType === "screen" && display.displayId),
    [displays]
  );

  const previewStreamRef = useRef<MediaStream | null>(null);
  const programStreamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    const loadPreview = async () => {
      stopMediaStream(previewStreamRef.current);
      if (!previewSourceId || !previewVideoRef.current) {
        return;
      }
      const stream = await getDisplayStream(previewSourceId, false);
      previewStreamRef.current = stream;
      previewVideoRef.current.srcObject = stream;
      previewVideoRef.current.play();
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
      const stream = await getDisplayStream(programSourceId, false);
      programStreamRef.current = stream;
      programVideoRef.current.srcObject = stream;
      programVideoRef.current.play();
    };

    loadProgram();

    return () => {
      stopMediaStream(programStreamRef.current);
    };
  }, [programSourceId, programVideoRef]);

  useEffect(() => {
    const canvas = programCanvasRef.current;
    const video = programVideoRef.current;
    if (!canvas || !video) {
      return;
    }

    const updateCanvasSize = () => {
      const profile = getQualityProfile(settings.qualityPreset);
      const target = fitToBounds(video.videoWidth || 1920, video.videoHeight || 1080, profile.maxWidth, profile.maxHeight);
      canvas.width = target.width;
      canvas.height = target.height;
    };

    if (video.readyState >= 2) {
      updateCanvasSize();
    } else {
      video.onloadedmetadata = updateCanvasSize;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const render = () => {
      if (isCutToBlack) {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
      } else if (video.readyState >= 2) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
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
  }, [programSourceId, programCanvasRef, programVideoRef, isCutToBlack, isFrozen, settings.qualityPreset]);

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
          <span className="tag">Select a display</span>
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

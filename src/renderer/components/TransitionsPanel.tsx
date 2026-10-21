import React, { useEffect, useMemo, useRef } from "react";
import { useAppStore } from "../store/useAppStore";
import { createManualBlendGesture, sceneTransitions } from "../utils/transitions";
import { SceneTransitionType } from "../../shared/types";

type TransitionsPanelProps = {
  canBlend?: boolean;
};

const TransitionsPanel: React.FC<TransitionsPanelProps> = ({ canBlend = true }) => {
  const {
    settings,
    updateSettings,
    transitionType,
    transitionDurationMs,
    manualBlend,
    setTransitionType,
    applyTransition,
    setTransitionDuration,
    setManualBlend,
    completeManualBlend,
    previewSceneId
  } = useAppStore();
  const gesture = useMemo(() => createManualBlendGesture(setManualBlend, completeManualBlend), [setManualBlend, completeManualBlend]);
  const gestureActive = useRef(false);
  const returnFrame = useRef<number | null>(null);
  const stopReturn = () => {
    if (returnFrame.current !== null) cancelAnimationFrame(returnFrame.current);
    returnFrame.current = null;
  };
  const beginGesture = () => {
    stopReturn();
    gestureActive.current = true;
    gesture.begin();
  };
  const endGesture = () => {
    if (!gestureActive.current) return;
    gestureActive.current = false;
    if (gesture.isComplete()) return;
    const { manualBlend: from, programRevision } = useAppStore.getState();
    stopReturn();
    const start = performance.now();
    const easeBack = (now: number) => {
      if (useAppStore.getState().programRevision !== programRevision) { returnFrame.current = null; return; }
      const progress = Math.min(1, (now - start) / 120);
      setManualBlend(from * (1 - progress) ** 2);
      returnFrame.current = progress < 1 ? requestAnimationFrame(easeBack) : null;
    };
    if (from > 0) returnFrame.current = requestAnimationFrame(easeBack);
  };
  useEffect(() => () => stopReturn(), []);

  return (
    <section className="compact-dock-panel transitions-dock-panel">
      <label>
        <span>Transition</span>
        <select
          value={transitionType}
          disabled={!previewSceneId}
          onChange={(event) => setTransitionType(event.target.value as SceneTransitionType)}
          aria-label="Scene transition type"
        >
          {sceneTransitions.map(transition => <option key={transition.type} value={transition.type}>{transition.label}</option>)}
        </select>
      </label>
      <label>
        <span>Duration</span>
        <div className="duration-input">
          <input
            type="number"
            min={100}
            max={15000}
            step={50}
            value={transitionDurationMs}
            onChange={(event) => setTransitionDuration(Number(event.target.value))}
          />
          <span>ms</span>
        </div>
      </label>
      <div className="transition-style-buttons" role="group" aria-label="Apply transition now">
        {sceneTransitions.map(transition => (
          <button key={transition.type} className={transitionType === transition.type ? "active" : ""}
            aria-label={`Apply ${transition.label} transition`} title={transition.description}
            disabled={!previewSceneId} onClick={() => { stopReturn(); applyTransition(transition.type); }}>
            {transition.label}
          </button>
        ))}
      </div>
      <p className="field-help">Each button sends Preview to Program using that effect. The selector prepares the effect for TAKE. Live Preview Blend remains a separate manual control.</p>
      <label><input type="checkbox" checked={settings.swapPreviewProgram !== false} onChange={(event) => updateSettings({ swapPreviewProgram: event.target.checked })} /> Swap Preview and Program after transitions</label>
      <div className="manual-blend-control">
        <div className="manual-blend-heading">
          <strong>Live Preview Blend</strong>
          <span>{Math.round(manualBlend * 100)}%</span>
        </div>
        <input
          aria-label="Live Preview blend"
          type="range"
          min={0}
          max={100}
          step={1}
          value={Math.round(manualBlend * 100)}
          disabled={!canBlend || !previewSceneId}
          onPointerDown={(event) => { beginGesture(); event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerUp={endGesture}
          onPointerCancel={endGesture}
          onLostPointerCapture={endGesture}
          onBlur={endGesture}
          onKeyDown={event => {
            if (!gestureActive.current && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) beginGesture();
          }}
          onKeyUp={event => {
            if (["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End", "PageUp", "PageDown"].includes(event.key)) endGesture();
          }}
          onChange={(event) => {
            if (!gestureActive.current) return;
            const input = event.currentTarget;
            gesture.input(Number(input.value) / 100);
            if (gesture.isComplete()) input.value = "0";
          }}
        />
        <div className="blend-scale"><span>Program</span><span>Preview</span></div>
        <p>Drag to blend live. Release to return smoothly to Program. Reaching 100% completes one take and resets the fader.</p>
        <div className="quick-transition-buttons blend-actions">
          <button onClick={() => { stopReturn(); setManualBlend(0); }} disabled={manualBlend === 0}>Reset to Program</button>
          <button onClick={() => { stopReturn(); completeManualBlend(); }} disabled={manualBlend === 0 || !previewSceneId}>Complete to Preview</button>
        </div>
        {!canBlend ? <p>Return to Studio Mode to prepare and blend a Preview scene.</p> : null}
      </div>
    </section>
  );
};

export default TransitionsPanel;

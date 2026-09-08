import React from "react";
import { useAppStore } from "../store/useAppStore";
import { applyManualBlendInput } from "../utils/transitions";

type TransitionsPanelProps = {
  canBlend?: boolean;
};

const TransitionsPanel: React.FC<TransitionsPanelProps> = ({ canBlend = true }) => {
  const {
    transitionType,
    transitionDurationMs,
    manualBlend,
    applyTransition,
    setTransitionDuration,
    setManualBlend,
    completeManualBlend,
    previewSceneId
  } = useAppStore();

  return (
    <section className="compact-dock-panel transitions-dock-panel">
      <label>
        <span>Transition</span>
        <select
          value={transitionType}
          disabled={!previewSceneId}
          onChange={(event) => applyTransition(event.target.value as "cut" | "fade" | "crossfade")}
          aria-label="Apply scene transition"
        >
          <option value="cut">Cut</option>
          <option value="fade">Fade</option>
          <option value="crossfade">Crossfade</option>
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
      <div className="quick-transition-buttons">
        <button onClick={() => applyTransition("cut")} disabled={!previewSceneId}>Cut</button>
        <button onClick={() => applyTransition("fade")} disabled={!previewSceneId}>Fade</button>
        <button onClick={() => applyTransition("crossfade")} disabled={!previewSceneId}>Crossfade</button>
      </div>
      <p className="field-help">Cut, Fade, and Crossfade immediately send Preview to Program. TAKE uses the most recently selected transition.</p>
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
          onInput={(event) => {
            const input = event.currentTarget;
            applyManualBlendInput(
              Number(input.value) / 100,
              setManualBlend,
              () => {
                completeManualBlend();
                input.value = "0";
              }
            );
          }}
        />
        <div className="blend-scale"><span>Program</span><span>Preview</span></div>
        <p>Move slowly to hold any live mixture. At 100%, Preview goes to Program and the control automatically returns to 0%. Program audio stays live until completion.</p>
        <div className="quick-transition-buttons blend-actions">
          <button onClick={() => setManualBlend(0)} disabled={manualBlend === 0}>Reset to Program</button>
          <button onClick={completeManualBlend} disabled={manualBlend === 0 || !previewSceneId}>Complete to Preview</button>
        </div>
        {!canBlend ? <p>Return to Studio Mode to prepare and blend a Preview scene.</p> : null}
      </div>
    </section>
  );
};

export default TransitionsPanel;

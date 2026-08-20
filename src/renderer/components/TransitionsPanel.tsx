import React from "react";
import { useAppStore } from "../store/useAppStore";

type TransitionsPanelProps = {
  canBlend?: boolean;
};

const TransitionsPanel: React.FC<TransitionsPanelProps> = ({ canBlend = true }) => {
  const {
    transitionType,
    transitionDurationMs,
    manualBlend,
    setTransitionType,
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
          onChange={(event) => setTransitionType(event.target.value as "cut" | "fade" | "crossfade")}
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
        <button onClick={() => setTransitionType("cut")}>Cut</button>
        <button onClick={() => setTransitionType("fade")}>Fade</button>
        <button onClick={() => setTransitionType("crossfade")}>Crossfade</button>
      </div>
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
          onChange={(event) => setManualBlend(Number(event.target.value) / 100)}
        />
        <div className="blend-scale"><span>Program</span><span>Preview</span></div>
        <p>Move slowly to hold any live mixture. Program audio stays live until you complete the blend.</p>
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

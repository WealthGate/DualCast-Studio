import React from "react";
import { useAppStore } from "../store/useAppStore";
import { applyManualBlendInput } from "../utils/transitions";

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
          onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
          onPointerUp={() => setManualBlend(0)}
          onPointerCancel={() => setManualBlend(0)}
          onLostPointerCapture={() => setManualBlend(0)}
          onBlur={() => setManualBlend(0)}
          onKeyUp={() => setManualBlend(0)}
          onInput={(event) => {
            const input = event.currentTarget;
            applyManualBlendInput(
              Number(input.value) / 100,
              setManualBlend,
              () => {
                completeManualBlend();
                input.value = "0";
              },
              (complete) => complete()
            );
          }}
        />
        <div className="blend-scale"><span>Program</span><span>Preview</span></div>
        <p>Drag to blend live. Release to return to Program and reset to 0%. Reaching 100% sends Preview to Program.</p>
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

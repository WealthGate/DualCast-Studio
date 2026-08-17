import React from "react";
import { useAppStore } from "../store/useAppStore";

const TransitionsPanel: React.FC = () => {
  const {
    transitionType,
    transitionDurationMs,
    setTransitionType,
    setTransitionDuration
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
            max={3000}
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
    </section>
  );
};

export default TransitionsPanel;

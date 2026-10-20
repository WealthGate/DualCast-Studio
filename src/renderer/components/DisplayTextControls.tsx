import React from "react";
import { useAppStore } from "../store/useAppStore";

const DisplayTextControls: React.FC = () => {
  const { displayTextMode, setDisplayTextMode, settings, isLowerThirdHidden, toggleLowerThirdHidden } = useAppStore();
  const hasLogo = Boolean(settings.lowerThird.imageUrl || settings.lowerThird.bibleImageUrl);
  return (
    <div className="display-text-controls" role="group" aria-label="Text on all outputs">
      <span className="display-controls-label">All outputs</span>
      <div className="display-text-actions">
        {([
          ["show", "Show Text"], ["hide", "Hide Text"],
          ["theme", "Theme Only"], ["logo", "Logo Only"]
        ] as const).map(([mode, label]) => (
          <button
            key={mode}
            type="button"
            className="btn btn-outline"
            disabled={mode === "logo" && !hasLogo}
            title={mode === "logo" ? (hasLogo ? "Use the image configured in Lower Third Studio as the output logo" : "Add an image in Lower Third Studio to enable Logo Only") : undefined}
            aria-pressed={displayTextMode === mode}
            onClick={() => setDisplayTextMode(mode)}
          >{label}</button>
        ))}
      </div>
      <button type="button" className="btn btn-outline lower-third-visibility-toggle"
        aria-pressed={isLowerThirdHidden} onClick={toggleLowerThirdHidden}
        title="Hide or restore the entire lower third on all outputs">
        {isLowerThirdHidden ? "Show Lower Third" : "Hide Lower Third"}
      </button>
    </div>
  );
};
export default DisplayTextControls;

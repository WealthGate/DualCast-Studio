import React from "react";
import { useAppStore } from "../store/useAppStore";

const DisplayTextControls: React.FC = () => {
  const { displayTextMode, setDisplayTextMode, settings } = useAppStore();
  return <div className="display-text-controls" role="group" aria-label="Text on all outputs">
    <span>All outputs:</span>
    {([ ["show", "Show Text"], ["hide", "Hide Text"], ["theme", "Theme Only"], ["logo", "Logo Only"] ] as const).map(([mode, label]) =>
      <button key={mode} className="btn btn-outline" disabled={mode === "logo" && !settings.lowerThird.imageUrl && !settings.lowerThird.bibleImageUrl} title={mode === "logo" ? "Use the image configured in Lower Third Studio as the output logo" : undefined} aria-pressed={displayTextMode === mode} onClick={() => setDisplayTextMode(mode)}>{label}</button>)}
  </div>;
};
export default DisplayTextControls;

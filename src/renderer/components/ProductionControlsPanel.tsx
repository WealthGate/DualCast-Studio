import React from "react";
import { useAppStore } from "../store/useAppStore";

type ProductionControlsPanelProps = {
  onStartRecording: () => void;
  onStopRecording: () => void;
  onOpenFolder: () => void;
};

const ProductionControlsPanel: React.FC<ProductionControlsPanelProps> = ({
  onStartRecording,
  onStopRecording,
  onOpenFolder
}) => {
  const {
    isRecording,
    recordingResult,
    previewSceneId,
    isCutToBlack,
    isFrozen,
    takeToProgram,
    cutToBlack,
    clearCutToBlack,
    toggleFreeze
  } = useAppStore();

  return (
    <section className="compact-dock-panel production-controls-panel">
      <button className="control-take" onClick={takeToProgram} disabled={!previewSceneId}>TAKE</button>
      <button className={isCutToBlack ? "control-warning active" : "control-warning"} onClick={isCutToBlack ? clearCutToBlack : cutToBlack}>
        {isCutToBlack ? "Restore Program" : "Cut to Black"}
      </button>
      <button className={isFrozen ? "active" : ""} onClick={toggleFreeze}>
        {isFrozen ? "Unfreeze" : "Freeze"}
      </button>
      <button className={isRecording ? "control-record active" : "control-record"} onClick={isRecording ? onStopRecording : onStartRecording}>
        {isRecording ? "Stop Recording" : "Start Recording"}
      </button>
      {recordingResult ? <button onClick={onOpenFolder}>Open Recordings</button> : null}
    </section>
  );
};

export default ProductionControlsPanel;

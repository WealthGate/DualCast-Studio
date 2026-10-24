import React from "react";
import { useAppStore } from "../store/useAppStore";
import { ProgramStreamerController } from "../hooks/useProgramStreamer";
import { VirtualCameraController } from "../hooks/useVirtualCamera";

type ProductionControlsPanelProps = {
  virtualCamera: VirtualCameraController;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onOpenFolder: () => void;
  streamer: ProgramStreamerController;
  studioModeActive: boolean;
  onStartStreaming: () => void;
  onOpenStreamSetup: () => void;
  onToggleStudioMode: () => void;
  onOpenSettings: () => void;
  onOpenAutoConfiguration: () => void;
};

const ProductionControlsPanel: React.FC<ProductionControlsPanelProps> = ({
  virtualCamera,
  onStartRecording,
  onStopRecording,
  onOpenFolder,
  streamer,
  studioModeActive,
  onStartStreaming,
  onOpenStreamSetup,
  onToggleStudioMode,
  onOpenSettings,
  onOpenAutoConfiguration
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
      <div className="primary-control-grid">
        <button className={streamer.status === "live" ? "control-stream active" : "control-stream"} onClick={streamer.status === "idle" || (streamer.status === "error" && streamer.destinationStatuses.length === 0) ? onStartStreaming : streamer.stopStream}>
          {streamer.status === "idle" || (streamer.status === "error" && streamer.destinationStatuses.length === 0) ? "Start Streaming" : "Stop Streaming"}
        </button>
        <button onClick={onOpenStreamSetup}>Stream Setup</button>
      </div>
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
      <button className={studioModeActive ? "control-studio active" : "control-studio"} aria-pressed={studioModeActive} onClick={onToggleStudioMode}>Studio Mode</button>
      <button onClick={onOpenAutoConfiguration}>Auto Configure</button>
      <button onClick={onOpenSettings}>Settings</button>
      <div className="virtual-camera-controls">
        <button
          className={virtualCamera.status.state === "running" ? "active" : ""}
          disabled={!virtualCamera.status.supported || virtualCamera.busy || virtualCamera.status.state === "starting"}
          aria-pressed={virtualCamera.status.state === "running"}
          onClick={() => void virtualCamera.configure(!virtualCamera.status.installed ? "install" : virtualCamera.status.state === "running" ? "stop" : "start")}
        >{virtualCamera.busy || virtualCamera.status.state === "starting" ? "Preparing Virtual Camera…" : !virtualCamera.status.installed ? "Install Virtual Camera" : virtualCamera.status.state === "running" ? "Stop Virtual Camera" : "Start Virtual Camera"}</button>
        <small role="status" aria-live="polite">{virtualCamera.status.message || (virtualCamera.status.state === "running" ? "Sending Program · 720p / 30 fps. Select OpenChurch Virtual Camera in your other app." : "Send Program to another app as a camera.")}</small>
        <small>Video only. Choose your microphone or audio input in the receiving app.</small>
        {virtualCamera.status.installed && virtualCamera.status.state !== "running" ? <button className="subtle" disabled={virtualCamera.busy} onClick={() => void virtualCamera.configure("uninstall")}>Remove Virtual Camera</button> : null}
      </div>
      <div className="control-status-line"><span className={`indicator ${streamer.status === "live" ? "live" : ""}`} /><span>{streamer.status === "live" ? `Live ${streamer.formattedElapsed}` : streamer.status.charAt(0).toUpperCase() + streamer.status.slice(1)}</span></div>
    </section>
  );
};

export default ProductionControlsPanel;

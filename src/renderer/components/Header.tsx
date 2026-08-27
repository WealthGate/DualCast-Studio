import React, { useEffect, useRef, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { AudioMode, UpdateStatusPayload, WorkspaceViewMode } from "../../shared/types";
import packageJson from "../../../package.json";
import { getUpdateControlView, normalizeVersion } from "../utils/updateControl";

const formatTimer = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

type HeaderProps = {
  onOpenMultiview: () => void;
  onCheckForUpdates: () => void;
  onDownloadUpdate: () => void;
  onInstallUpdate: () => void;
  onDownloadUserGuide: () => void;
  updateStatus: UpdateStatusPayload | null;
  viewMode: WorkspaceViewMode;
  onChangeViewMode: (mode: WorkspaceViewMode) => void;
};

const Header: React.FC<HeaderProps> = ({
  onOpenMultiview,
  onCheckForUpdates,
  onDownloadUpdate,
  onInstallUpdate,
  onDownloadUserGuide,
  updateStatus,
  viewMode,
  onChangeViewMode
}) => {
  const {
    isRecording,
    recordingSeconds,
    recordingResult,
    recordingError,
    settings,
    updateSettings
  } = useAppStore();
  const [openMenu, setOpenMenu] = useState<"menu" | "view" | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const updateControl = getUpdateControlView(updateStatus, packageJson.version);
  const installedVersion = normalizeVersion(updateStatus?.currentVersion ?? packageJson.version);

  useEffect(() => {
    if (!openMenu) {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      if (!menuRef.current) {
        return;
      }
      if (!menuRef.current.contains(event.target as Node)) {
        setOpenMenu(null);
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [openMenu]);

  const handleAudioChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    updateSettings({ audioMode: event.target.value as AudioMode });
  };

  const handleUpdateAction = () => {
    if (updateControl.action === "download") {
      onDownloadUpdate();
      return;
    }
    if (updateControl.action === "install") {
      onInstallUpdate();
      return;
    }
    if (updateControl.action === "check") {
      onCheckForUpdates();
    }
  };

  return (
    <header className="app-header">
      <div className="brand">
        <div className="menu-bar" ref={menuRef}>
          <div className="menu">
            <button className="btn btn-outline btn-compact" onClick={() => setOpenMenu((value) => value === "menu" ? null : "menu")}>
              Menu
            </button>
            {openMenu === "menu" ? (
              <div className="menu-panel">
                <div className="menu-title">Hotkeys</div>
                <div className="menu-item">Record: Ctrl/Cmd + Shift + R</div>
                <div className="menu-item">TAKE: Ctrl/Cmd + Enter</div>
                <div className="menu-item">Cut to Black: Ctrl/Cmd + B</div>
                <button
                  className="menu-command"
                  onClick={() => {
                    setOpenMenu(null);
                    onCheckForUpdates();
                  }}
                >
                  Check for Updates
                  <span>Installed v{installedVersion}</span>
                </button>
                <button className="menu-command" onClick={() => { setOpenMenu(null); onDownloadUserGuide(); }}>
                  Download User Guide
                  <span>Complete PDF manual</span>
                </button>
              </div>
            ) : null}
          </div>
          <div className="menu">
            <button className="btn btn-outline btn-compact" onClick={() => setOpenMenu((value) => value === "view" ? null : "view")}>
              View
            </button>
            {openMenu === "view" ? (
              <div className="menu-panel">
                <div className="menu-title">Workspace View</div>
                <button
                  className="menu-command"
                  onClick={() => {
                    setOpenMenu(null);
                    onChangeViewMode("studio");
                  }}
                  aria-pressed={viewMode === "studio"}
                >
                  Studio Mode
                  <span>Preview + Program + operating docks</span>
                </button>
                <button
                  className="menu-command"
                  onClick={() => {
                    setOpenMenu(null);
                    onChangeViewMode("program-focus");
                  }}
                  aria-pressed={viewMode === "program-focus"}
                >
                  Program Focus
                  <span>Program fills the center; docks remain and scene clicks go live</span>
                </button>
                <button
                  className="menu-command"
                  onClick={() => {
                    setOpenMenu(null);
                    onChangeViewMode("program-only");
                  }}
                  aria-pressed={viewMode === "program-only"}
                >
                  Full Program Only
                  <span>Program fills the entire app; operating docks are hidden</span>
                </button>
                <button
                  className="menu-command"
                  onClick={() => {
                    setOpenMenu(null);
                    onOpenMultiview();
                  }}
                >
                  Open Multiview Window
                  <span>Scenes + Cameras</span>
                </button>
              </div>
            ) : null}
          </div>
        </div>
        <span className="brand-dot" />
        <div>
          <h1>OpenChurch Broadcast Studio</h1>
          <p>Open Church Production · v{packageJson.version}</p>
        </div>
      </div>
      <div className="header-controls">
        <button
          className={`btn header-update-button state-${updateStatus?.state ?? "idle"} ${updateControl.emphasis === "primary" ? "btn-primary" : "btn-outline"}`}
          type="button"
          onClick={handleUpdateAction}
          disabled={updateControl.disabled}
          aria-label={`${updateControl.label}. ${updateControl.detail}`}
        >
          <span>{updateControl.label}</span>
          <small>{updateControl.detail}</small>
        </button>
        <div className="recording-status">
          <span className={isRecording ? "indicator live" : "indicator"} />
          <span>{isRecording ? "Recording" : "Idle"}</span>
          <span className="timer">{formatTimer(recordingSeconds)}</span>
        </div>
        <div className="control-group">
          <label htmlFor="audioMode">Audio</label>
          <select id="audioMode" value={settings.audioMode} onChange={handleAudioChange}>
            <option value="system">Scene Sources</option>
            <option value="microphone">Mic (All Scenes)</option>
            <option value="both">Sources + Mic</option>
            <option value="none">Mute All</option>
          </select>
        </div>
        {recordingError ? <span className="error-pill">{recordingError}</span> : null}
        {recordingResult?.usedFallback ? (
          <span className="warn-pill">Saved as WebM (FFmpeg fallback)</span>
        ) : null}
      </div>
    </header>
  );
};

export default Header;

import React, { useEffect, useRef, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { AudioMode } from "../../shared/types";

const formatTimer = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

type HeaderProps = {
  onStartRecording: () => void;
  onStopRecording: () => void;
  onOpenFolder: () => void;
};

const Header: React.FC<HeaderProps> = ({ onStartRecording, onStopRecording, onOpenFolder }) => {
  const {
    isRecording,
    recordingSeconds,
    recordingResult,
    recordingError,
    settings,
    updateSettings
  } = useAppStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handleClick = (event: MouseEvent) => {
      if (!menuRef.current) {
        return;
      }
      if (!menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClick);
    return () => {
      document.removeEventListener("mousedown", handleClick);
    };
  }, [menuOpen]);

  const handleAudioChange = (event: React.ChangeEvent<HTMLSelectElement>) => {
    updateSettings({ audioMode: event.target.value as AudioMode });
  };

  return (
    <header className="app-header">
      <div className="brand">
        <div className="menu" ref={menuRef}>
          <button className="btn btn-outline btn-compact" onClick={() => setMenuOpen((open) => !open)}>
            Menu
          </button>
          {menuOpen ? (
            <div className="menu-panel">
              <div className="menu-title">Hotkeys</div>
              <div className="menu-item">Record: Ctrl/Cmd + Shift + R</div>
              <div className="menu-item">TAKE: Ctrl/Cmd + Enter</div>
              <div className="menu-item">Cut to Black: Ctrl/Cmd + B</div>
            </div>
          ) : null}
        </div>
        <span className="brand-dot" />
        <div>
          <h1>DualCast Studio</h1>
          <p>Phase 2b - Streaming Hardened</p>
        </div>
      </div>
      <div className="header-controls">
        <div className="recording-status">
          <span className={isRecording ? "indicator live" : "indicator"} />
          <span>{isRecording ? "Recording" : "Idle"}</span>
          <span className="timer">{formatTimer(recordingSeconds)}</span>
        </div>
        <div className="control-group">
          <label htmlFor="audioMode">Audio</label>
          <select id="audioMode" value={settings.audioMode} onChange={handleAudioChange}>
            <option value="system">System</option>
            <option value="microphone">Microphone</option>
            <option value="both">System + Mic</option>
            <option value="none">None</option>
          </select>
        </div>
        <div className="control-group">
          {isRecording ? (
            <button className="btn btn-danger" onClick={onStopRecording}>
              Stop
            </button>
          ) : (
            <button className="btn btn-primary" onClick={onStartRecording}>
              Record
            </button>
          )}
        </div>
        {recordingResult ? (
          <button className="btn btn-outline" onClick={onOpenFolder}>
            Open Folder
          </button>
        ) : null}
        {recordingError ? <span className="error-pill">{recordingError}</span> : null}
        {recordingResult?.usedFallback ? (
          <span className="warn-pill">Saved as WebM (FFmpeg fallback)</span>
        ) : null}
      </div>
    </header>
  );
};

export default Header;

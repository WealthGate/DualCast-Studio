import React, { useMemo, useState } from "react";
import { useProgramStreamer } from "../hooks/useProgramStreamer";

type StreamingPanelProps = {
  programCanvasRef: React.RefObject<HTMLCanvasElement>;
};

const formatEndpoint = (rtmpUrl: string, streamKey: string) => {
  if (!rtmpUrl) {
    return "";
  }
  const trimmed = rtmpUrl.replace(/\/+$/, "");
  return streamKey ? `${trimmed}/${streamKey}` : trimmed;
};

const StreamingPanel: React.FC<StreamingPanelProps> = ({ programCanvasRef }) => {
  const { status, statusMessage, formattedElapsed, startStream, stopStream } = useProgramStreamer(programCanvasRef);
  const [rtmpUrl, setRtmpUrl] = useState("");
  const [streamKey, setStreamKey] = useState("");
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [logPath, setLogPath] = useState<string | null>(null);

  const endpoint = useMemo(() => formatEndpoint(rtmpUrl, streamKey), [rtmpUrl, streamKey]);
  const isActive = status === "connecting" || status === "live";

  const handleStart = async () => {
    setLocalMessage(null);
    const result = await startStream(rtmpUrl.trim(), streamKey.trim());
    if (!result.ok) {
      setLocalMessage(result.message ?? "Unable to start streaming.");
    }
  };

  const handleOpenLogs = async () => {
    try {
      const path = logPath ?? (await window.dualcast.getStreamLogPath());
      if (path) {
        setLogPath(path);
        await window.dualcast.openFolder(path);
      }
    } catch {
      setLocalMessage("Unable to open stream logs.");
    }
  };

  return (
    <section className="panel streaming-panel">
      <h2>Streaming</h2>
      <div className="field">
        <label htmlFor="rtmpUrl">RTMP URL</label>
        <input
          id="rtmpUrl"
          type="text"
          placeholder="rtmp://a.rtmp.youtube.com/live2"
          value={rtmpUrl}
          onChange={(event) => setRtmpUrl(event.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="streamKey">Stream Key</label>
        <input
          id="streamKey"
          type="password"
          placeholder="Enter stream key"
          value={streamKey}
          onChange={(event) => setStreamKey(event.target.value)}
        />
      </div>
      <div className="field">
        <label>Endpoint</label>
        <input type="text" value={endpoint} readOnly />
      </div>
      <div className="streaming-status-row">
        <div className="streaming-status">
          <span className={`indicator ${status === "live" ? "live" : ""}`} />
          <span className="streaming-status-text">{status.charAt(0).toUpperCase() + status.slice(1)}</span>
          {status === "live" ? <span className="timer">{formattedElapsed}</span> : null}
        </div>
        {statusMessage ? <span className="error-pill">{statusMessage}</span> : null}
        {localMessage ? <span className="error-pill">{localMessage}</span> : null}
      </div>
      <div className="streaming-actions">
        <button className="btn btn-primary" onClick={handleStart} disabled={isActive || !rtmpUrl || !streamKey}>
          Start Stream
        </button>
        <button className="btn btn-danger" onClick={stopStream} disabled={!isActive}>
          Stop Stream
        </button>
        <button className="btn btn-outline" onClick={handleOpenLogs}>
          Open Stream Logs
        </button>
      </div>
    </section>
  );
};

export default StreamingPanel;

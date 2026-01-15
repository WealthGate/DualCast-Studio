import React, { useEffect, useMemo, useState } from "react";
import { useProgramStreamer } from "../hooks/useProgramStreamer";
import { useAppStore } from "../store/useAppStore";
import { StreamingAudioBitrate, StreamingEncoder, StreamingFps, StreamingPreset } from "../../shared/types";

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
  const { status, statusMessage, formattedElapsed, stats, lastError, startStream, stopStream } = useProgramStreamer(programCanvasRef);
  const { settings, updateSettings } = useAppStore();
  const [rtmpUrl, setRtmpUrl] = useState(settings.streamRtmpUrl);
  const [streamKey, setStreamKey] = useState("");
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [logPath, setLogPath] = useState<string | null>(null);
  const [availableEncoders, setAvailableEncoders] = useState<StreamingEncoder[]>([]);

  useEffect(() => {
    setRtmpUrl(settings.streamRtmpUrl);
  }, [settings.streamRtmpUrl]);

  useEffect(() => {
    window.dualcast
      .getStreamingCapabilities()
      .then((caps) => setAvailableEncoders(caps.encoders))
      .catch(() => setAvailableEncoders(["x264"]));
  }, []);

  useEffect(() => {
    if (!settings.rememberStreamKey) {
      setStreamKey("");
      return;
    }
    window.dualcast
      .getStoredStreamKey()
      .then((stored) => {
        if (stored) {
          setStreamKey(stored);
        }
      })
      .catch(() => undefined);
  }, [settings.rememberStreamKey]);

  const endpoint = useMemo(() => formatEndpoint(rtmpUrl, streamKey), [rtmpUrl, streamKey]);
  const isActive = status === "connecting" || status === "live" || status === "reconnecting";

  const handleStart = async () => {
    setLocalMessage(null);
    const result = await startStream(rtmpUrl.trim(), streamKey.trim());
    if (!result.ok) {
      setLocalMessage(result.message ?? "Unable to start streaming.");
      return;
    }
    if (settings.rememberStreamKey && streamKey.trim().length > 0) {
      await window.dualcast.setStoredStreamKey({ streamKey: streamKey.trim() });
    }
  };

  const handleRememberToggle = async (checked: boolean) => {
    await updateSettings({ rememberStreamKey: checked });
    if (!checked) {
      await window.dualcast.clearStoredStreamKey();
      setStreamKey("");
    }
  };

  const handlePresetChange = async (value: StreamingPreset) => {
    await updateSettings({ streamPreset: value });
  };

  const handleFpsChange = async (value: StreamingFps) => {
    await updateSettings({ streamFps: value });
  };

  const handleAudioBitrateChange = async (value: StreamingAudioBitrate) => {
    await updateSettings({ streamAudioBitrate: value });
  };

  const handleEncoderChange = async (value: StreamingEncoder) => {
    await updateSettings({ streamEncoder: value });
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
          onChange={(event) => {
            const value = event.target.value;
            setRtmpUrl(value);
            updateSettings({ streamRtmpUrl: value });
          }}
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
      <div className="field field-row">
        <label htmlFor="rememberKey">Remember Stream Key</label>
        <input
          id="rememberKey"
          type="checkbox"
          checked={settings.rememberStreamKey}
          onChange={(event) => handleRememberToggle(event.target.checked)}
        />
      </div>
      <div className="field">
        <label>Endpoint</label>
        <input type="text" value={endpoint} readOnly />
      </div>
      <div className="field">
        <label htmlFor="preset">Preset</label>
        <select
          id="preset"
          value={settings.streamPreset}
          onChange={(event) => handlePresetChange(event.target.value as StreamingPreset)}
        >
          <option value="low">Low (720p30 ~2500k)</option>
          <option value="medium">Medium (1080p30 ~4500k)</option>
          <option value="high">High (1080p60 ~6500k)</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="streamFps">FPS</label>
        <select
          id="streamFps"
          value={settings.streamFps}
          onChange={(event) => handleFpsChange(Number(event.target.value) as StreamingFps)}
        >
          <option value={30}>30 fps</option>
          <option value={60}>60 fps</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="audioBitrate">Audio Bitrate</label>
        <select
          id="audioBitrate"
          value={settings.streamAudioBitrate}
          onChange={(event) => handleAudioBitrateChange(Number(event.target.value) as StreamingAudioBitrate)}
        >
          <option value={128}>128k</option>
          <option value={192}>192k</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="encoder">Encoder</label>
        <select
          id="encoder"
          value={settings.streamEncoder}
          onChange={(event) => handleEncoderChange(event.target.value as StreamingEncoder)}
        >
          <option value="auto">Auto</option>
          <option value="x264">x264 (CPU)</option>
          <option value="nvenc" disabled={!availableEncoders.includes("nvenc")}>
            NVENC {availableEncoders.includes("nvenc") ? "" : "(Unavailable)"}
          </option>
          <option value="qsv" disabled={!availableEncoders.includes("qsv")}>
            QSV {availableEncoders.includes("qsv") ? "" : "(Unavailable)"}
          </option>
          <option value="amf" disabled={!availableEncoders.includes("amf")}>
            AMF {availableEncoders.includes("amf") ? "" : "(Unavailable)"}
          </option>
        </select>
      </div>
      <div className="streaming-status-row">
        <div className="streaming-status">
          <span className={`indicator ${status === "live" ? "live" : ""}`} />
          <span className="streaming-status-text">{status.charAt(0).toUpperCase() + status.slice(1)}</span>
          {status === "live" ? <span className="timer">{formattedElapsed}</span> : null}
        </div>
        {stats?.bitrateKbps ? <span className="tag">Bitrate: {stats.bitrateKbps.toFixed(0)} kbps</span> : null}
        {stats?.fps ? <span className="tag">FPS: {stats.fps.toFixed(0)}</span> : null}
        {stats?.time ? <span className="tag">Time: {stats.time}</span> : null}
        {typeof stats?.droppedFrames === "number" ? <span className="tag">Dropped: {stats.droppedFrames}</span> : null}
        {statusMessage ? <span className="error-pill">{statusMessage}</span> : null}
        {localMessage ? <span className="error-pill">{localMessage}</span> : null}
        {lastError && (status === "error" || status === "reconnecting") ? (
          <span className="warn-pill">{lastError}</span>
        ) : null}
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

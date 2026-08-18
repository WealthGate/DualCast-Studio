import React, { useEffect, useState } from "react";
import { ProgramStreamerController } from "../hooks/useProgramStreamer";
import { useAppStore } from "../store/useAppStore";
import {
  StreamDestinationConfig,
  StreamingAudioBitrate,
  StreamingEncoder,
  StreamingFps,
  StreamingPreset,
  StreamPlatform
} from "../../shared/types";

type StreamingPanelProps = {
  streamer: ProgramStreamerController;
};

const formatEndpoint = (rtmpUrl: string, streamKey: string) => {
  if (!rtmpUrl) {
    return "";
  }
  const trimmed = rtmpUrl.replace(/\/+$/, "");
  return streamKey ? `${trimmed}/${streamKey}` : trimmed;
};

const StreamingPanel: React.FC<StreamingPanelProps> = ({ streamer }) => {
  const {
    status,
    statusMessage,
    formattedElapsed,
    stats,
    lastError,
    destinationStatuses,
    startStream,
    stopStream
  } = streamer;
  const { settings, updateSettings } = useAppStore();
  const [streamKeys, setStreamKeys] = useState<Record<string, string>>({});
  const [localMessage, setLocalMessage] = useState<string | null>(null);
  const [logPath, setLogPath] = useState<string | null>(null);
  const [availableEncoders, setAvailableEncoders] = useState<StreamingEncoder[]>([]);
  const [logOpen, setLogOpen] = useState(false);
  const [logContent, setLogContent] = useState("");
  const [logLoading, setLogLoading] = useState(false);
  const [authorizingId, setAuthorizingId] = useState<string | null>(null);
  const destinationIds = settings.streamDestinations.map((destination) => destination.id).join("|");

  useEffect(() => {
    window.dualcast
      .getStreamingCapabilities()
      .then((caps) => setAvailableEncoders(caps.encoders))
      .catch(() => setAvailableEncoders(["x264"]));
  }, []);

  useEffect(() => {
    if (!settings.rememberStreamKey) {
      setStreamKeys({});
      return;
    }
    Promise.all(
      settings.streamDestinations.map(async (destination) => ({
        id: destination.id,
        key: await window.dualcast.getStoredStreamKey({ destinationId: destination.id })
      }))
    )
      .then((stored) => {
        setStreamKeys(
          Object.fromEntries(stored.filter((entry) => entry.key).map((entry) => [entry.id, entry.key as string]))
        );
      })
      .catch(() => undefined);
  }, [destinationIds, settings.rememberStreamKey]);

  const isActive =
    status === "connecting" ||
    status === "live" ||
    status === "reconnecting" ||
    (status === "error" && destinationStatuses.length > 0);

  const handleStart = async () => {
    setLocalMessage(null);
    const destinations = settings.streamDestinations.map((destination) => ({
      ...destination,
      rtmpUrl: destination.rtmpUrl.trim(),
      streamKey: (streamKeys[destination.id] ?? "").trim()
    }));
    const result = await startStream(destinations);
    if (!result.ok) {
      setLocalMessage(result.message ?? "Unable to start streaming.");
      return;
    }
    if (settings.rememberStreamKey) {
      await Promise.all(
        destinations
          .filter((destination) => destination.streamKey)
          .map((destination) =>
            window.dualcast.setStoredStreamKey({
              destinationId: destination.id,
              streamKey: destination.streamKey
            })
          )
      );
    }
  };

  const handleRememberToggle = async (checked: boolean) => {
    await updateSettings({ rememberStreamKey: checked });
    if (!checked) {
      await window.dualcast.clearStoredStreamKey();
      setStreamKeys({});
    }
  };

  const updateDestination = async (destinationId: string, update: Partial<StreamDestinationConfig>) => {
    await updateSettings({
      streamDestinations: settings.streamDestinations.map((destination) =>
        destination.id === destinationId ? { ...destination, ...update } : destination
      )
    });
  };

  const addDestination = async () => {
    const id = crypto.randomUUID ? crypto.randomUUID() : `stream-${Date.now()}`;
    await updateSettings({
      streamDestinations: [
        ...settings.streamDestinations,
        { id, name: `Destination ${settings.streamDestinations.length + 1}`, rtmpUrl: "", enabled: true, platform: "custom" }
      ]
    });
  };

  const removeDestination = async (destinationId: string) => {
    if (settings.streamDestinations.length <= 1) {
      return;
    }
    await window.dualcast.clearStoredStreamKey({ destinationId });
    setStreamKeys((current) => {
      const next = { ...current };
      delete next[destinationId];
      return next;
    });
    await updateSettings({
      streamDestinations: settings.streamDestinations.filter(
        (destination) => destination.id !== destinationId
      )
    });
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

  const authorizeDestination = async (destination: StreamDestinationConfig) => {
    if (destination.platform !== "youtube" && destination.platform !== "facebook") return;
    setAuthorizingId(destination.id);
    setLocalMessage("Opening secure authorization in your browser...");
    try {
      const result = await window.dualcast.authorizeStreaming({ provider: destination.platform, destinationId: destination.id });
      setLocalMessage(result.message);
      if (!result.ok) return;
      await updateDestination(destination.id, {
        authorizedAccount: result.account ?? destination.authorizedAccount,
        rtmpUrl: result.rtmpUrl ?? destination.rtmpUrl
      });
      if (result.streamKey) {
        setStreamKeys((current) => ({ ...current, [destination.id]: result.streamKey as string }));
        if (settings.rememberStreamKey) await window.dualcast.setStoredStreamKey({ destinationId: destination.id, streamKey: result.streamKey });
      }
    } catch (error) {
      setLocalMessage(error instanceof Error ? error.message : "Account authorization failed.");
    } finally {
      setAuthorizingId(null);
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

  const fetchLogContent = async () => {
    try {
      setLogLoading(true);
      const content = await window.dualcast.getStreamLogContent({ maxLines: 400 });
      setLogContent(content || "No logs yet.");
    } catch {
      setLogContent("Unable to load logs.");
    } finally {
      setLogLoading(false);
    }
  };

  const handleToggleLogViewer = async () => {
    const next = !logOpen;
    setLogOpen(next);
    if (next) {
      await fetchLogContent();
    }
  };

  return (
    <section className="panel streaming-panel">
      <div className="panel-header">
        <h2>Streaming Destinations</h2>
        <button className="btn btn-outline btn-compact" onClick={addDestination} disabled={isActive}>
          Add Destination
        </button>
      </div>
      <div className="destination-list">
        {settings.streamDestinations.map((destination, index) => (
          <div key={destination.id} className="destination-card">
            <div className="destination-card-header">
              <label className="destination-enabled">
                <input
                  type="checkbox"
                  checked={destination.enabled}
                  onChange={(event) => updateDestination(destination.id, { enabled: event.target.checked })}
                  disabled={isActive}
                />
                Enabled
              </label>
              <button
                className="btn btn-danger btn-compact"
                onClick={() => removeDestination(destination.id)}
                disabled={isActive || settings.streamDestinations.length <= 1}
              >
                Remove
              </button>
            </div>
            <div className="field">
              <label htmlFor={`destination-name-${index}`}>Name</label>
              <input
                id={`destination-name-${index}`}
                value={destination.name}
                onChange={(event) => updateDestination(destination.id, { name: event.target.value })}
                disabled={isActive}
              />
            </div>
            <div className="field">
              <label htmlFor={`destination-platform-${index}`}>Platform</label>
              <select
                id={`destination-platform-${index}`}
                value={destination.platform ?? "custom"}
                onChange={(event) => updateDestination(destination.id, { platform: event.target.value as StreamPlatform, authorizedAccount: null })}
                disabled={isActive}
              >
                <option value="custom">Custom RTMP</option>
                <option value="youtube">YouTube Live</option>
                <option value="facebook">Facebook Live</option>
              </select>
            </div>
            {destination.platform === "youtube" || destination.platform === "facebook" ? (
              <div className="stream-authorization">
                <button className="btn btn-outline" onClick={() => authorizeDestination(destination)} disabled={isActive || authorizingId === destination.id}>
                  {authorizingId === destination.id ? "Connecting..." : `Connect ${destination.platform === "youtube" ? "YouTube" : "Facebook"} Account`}
                </button>
                <span className={destination.authorizedAccount ? "tag" : "field-help"}>{destination.authorizedAccount ? `Connected: ${destination.authorizedAccount}` : "Sign in with the account used by this streaming platform."}</span>
              </div>
            ) : null}
            <div className="field">
              <label htmlFor={`destination-url-${index}`}>RTMP URL</label>
              <input
                id={`destination-url-${index}`}
                placeholder="rtmp://a.rtmp.youtube.com/live2"
                value={destination.rtmpUrl}
                onChange={(event) => updateDestination(destination.id, { rtmpUrl: event.target.value })}
                disabled={isActive}
              />
            </div>
            <div className="field">
              <label htmlFor={`destination-key-${index}`}>Stream Key</label>
              <input
                id={`destination-key-${index}`}
                type="password"
                value={streamKeys[destination.id] ?? ""}
                onChange={(event) =>
                  setStreamKeys((current) => ({ ...current, [destination.id]: event.target.value }))
                }
                disabled={isActive}
              />
            </div>
            <div className="endpoint-preview">
              {formatEndpoint(destination.rtmpUrl, streamKeys[destination.id] ?? "") || "Endpoint not configured"}
            </div>
          </div>
        ))}
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
      {destinationStatuses.length > 0 ? (
        <div className="destination-status-list">
          {destinationStatuses.map((destination) => (
            <div key={destination.id} className={`destination-status ${destination.status}`}>
              <strong>{destination.name}</strong>
              <span>{destination.status}</span>
              {destination.message ? <small>{destination.message}</small> : null}
            </div>
          ))}
        </div>
      ) : null}
      <div className="streaming-actions">
        <button
          className="btn btn-primary"
          onClick={handleStart}
          disabled={
            isActive ||
            !settings.streamDestinations.some(
              (destination) =>
                destination.enabled && destination.rtmpUrl && (streamKeys[destination.id] ?? "")
            )
          }
        >
          Start Stream
        </button>
        <button className="btn btn-danger" onClick={stopStream} disabled={!isActive}>
          Stop Stream
        </button>
        <button className="btn btn-outline" onClick={handleToggleLogViewer}>
          {logOpen ? "Hide Logs" : "View Logs"}
        </button>
        <button className="btn btn-outline" onClick={handleOpenLogs}>
          Open Stream Logs
        </button>
      </div>
      {logOpen ? (
        <div className="log-viewer">
          <div className="log-viewer-header">
            <span>Latest log lines</span>
            <button className="btn btn-outline btn-compact" onClick={fetchLogContent} disabled={logLoading}>
              {logLoading ? "Loading..." : "Refresh"}
            </button>
          </div>
          <pre>{logContent}</pre>
        </div>
      ) : null}
    </section>
  );
};

export default StreamingPanel;

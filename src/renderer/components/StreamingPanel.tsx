import React, { useEffect, useState } from "react";
import { ProgramStreamerController } from "../hooks/useProgramStreamer";
import { useAppStore } from "../store/useAppStore";
import {
  StreamDestinationConfig,
  StreamingAudioBitrate,
  StreamingEncoder,
  StreamingFps,
  StreamingPreset,
  StreamPlatform,
  YouTubeBroadcastSettings
} from "../../shared/types";
import { STREAMING_ENCODER_OPTIONS } from "../../shared/streamingEncoders";
import {
  DEFAULT_YOUTUBE_BROADCAST_SETTINGS,
  normalizeYouTubeBroadcastSettings,
  validateYouTubeBroadcastSettings,
  YOUTUBE_VIDEO_CATEGORIES
} from "../../shared/streamingPlatforms";

type StreamingPanelProps = {
  streamer: ProgramStreamerController;
  startRequest?: number;
};

const formatEndpoint = (rtmpUrl: string, streamKey: string) => {
  if (!rtmpUrl) {
    return "";
  }
  const trimmed = rtmpUrl.replace(/\/+$/, "");
  return streamKey ? `${trimmed}/${streamKey}` : trimmed;
};

const StreamingPanel: React.FC<StreamingPanelProps> = ({ streamer, startRequest = 0 }) => {
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
  const [secureStorageAvailable, setSecureStorageAvailable] = useState<boolean | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [logContent, setLogContent] = useState("");
  const [logLoading, setLogLoading] = useState(false);
  const [authorizingId, setAuthorizingId] = useState<string | null>(null);
  const [handledStartRequest, setHandledStartRequest] = useState(startRequest);
  const destinationIds = settings.streamDestinations.map((destination) => destination.id).join("|");

  useEffect(() => {
    window.dualcast
      .getStreamingCapabilities()
      .then(async (caps) => {
        setAvailableEncoders(caps.encoders);
        setSecureStorageAvailable(caps.secureStorageAvailable);
        if (!caps.secureStorageAvailable) {
          await window.dualcast.clearStoredStreamKey();
          if (useAppStore.getState().settings.rememberStreamKey) {
            await useAppStore.getState().updateSettings({ rememberStreamKey: false });
          }
        }
      })
      .catch(() => {
        setAvailableEncoders(["x264"]);
        setSecureStorageAvailable(false);
      });
  }, []);

  useEffect(() => {
    if (!settings.rememberStreamKey || secureStorageAvailable !== true) {
      return;
    }
    Promise.all(
      settings.streamDestinations.map(async (destination) => ({
        id: destination.id,
        key: await window.dualcast.getStoredStreamKey({ destinationId: destination.id })
      }))
    )
      .then((stored) => {
        setStreamKeys((current) => ({
          ...current,
          ...Object.fromEntries(stored.filter((entry) => entry.key).map((entry) => [entry.id, entry.key as string]))
        }));
      })
      .catch(() => undefined);
  }, [destinationIds, secureStorageAvailable, settings.rememberStreamKey]);

  const isActive =
    status === "connecting" ||
    status === "live" ||
    status === "reconnecting" ||
    (status === "error" && destinationStatuses.length > 0);

  const handleStart = async () => {
    setLocalMessage(null);
    const unpreparedYouTube = settings.streamDestinations.find(
      (destination) => destination.enabled && destination.platform === "youtube" && !destination.providerBroadcastId
    );
    if (unpreparedYouTube) {
      setLocalMessage(`Use Connect & Create YouTube Broadcast for ${unpreparedYouTube.name} before starting.`);
      return;
    }
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
    if (settings.rememberStreamKey && secureStorageAvailable) {
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
    if (checked && !secureStorageAvailable) {
      setLocalMessage("Secure operating-system credential storage is unavailable, so stream keys will not be saved.");
      return;
    }
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
        {
          id,
          name: `Destination ${settings.streamDestinations.length + 1}`,
          rtmpUrl: "",
          enabled: true,
          platform: "custom",
          broadcast: DEFAULT_YOUTUBE_BROADCAST_SETTINGS
        }
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

  useEffect(() => {
    if (startRequest <= handledStartRequest) return;
    setHandledStartRequest(startRequest);
    void handleStart();
  }, [startRequest]);

  const updateYouTubeBroadcast = async (
    destination: StreamDestinationConfig,
    update: Partial<YouTubeBroadcastSettings>
  ) => {
    if (destination.providerBroadcastId) {
      await window.dualcast.clearStoredStreamKey({ destinationId: destination.id });
      setStreamKeys((current) => {
        const next = { ...current };
        delete next[destination.id];
        return next;
      });
    }
    await updateDestination(destination.id, {
      broadcast: {
        ...normalizeYouTubeBroadcastSettings(destination.broadcast),
        ...update
      },
      providerBroadcastId: null,
      rtmpUrl: destination.providerBroadcastId ? "" : destination.rtmpUrl
    });
  };

  const authorizeDestination = async (destination: StreamDestinationConfig, forceAccountSelection = false) => {
    if (destination.platform !== "youtube" && destination.platform !== "facebook") return;
    if (destination.platform === "youtube") {
      const validationError = validateYouTubeBroadcastSettings(
        normalizeYouTubeBroadcastSettings(destination.broadcast)
      );
      if (validationError) {
        setLocalMessage(validationError);
        return;
      }
    }
    setAuthorizingId(destination.id);
    setLocalMessage("Opening secure authorization in your browser...");
    try {
      const result = await window.dualcast.authorizeStreaming({
        provider: destination.platform,
        destinationId: destination.id,
        broadcast: destination.platform === "youtube"
          ? normalizeYouTubeBroadcastSettings(destination.broadcast)
          : undefined,
        preset: settings.streamPreset,
        fps: settings.streamFps,
        forceAccountSelection
      });
      setLocalMessage(result.message);
      if (!result.ok) return;
      await updateDestination(destination.id, {
        authorizedAccount: result.account ?? destination.authorizedAccount,
        rtmpUrl: result.rtmpUrl ?? destination.rtmpUrl,
        providerBroadcastId: result.broadcastId ?? destination.providerBroadcastId
      });
      if (result.streamKey) {
        setStreamKeys((current) => ({ ...current, [destination.id]: result.streamKey as string }));
        if (settings.rememberStreamKey && secureStorageAvailable) await window.dualcast.setStoredStreamKey({ destinationId: destination.id, streamKey: result.streamKey });
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
                onChange={(event) => updateDestination(destination.id, {
                  platform: event.target.value as StreamPlatform,
                  authorizedAccount: null,
                  providerBroadcastId: null
                })}
                disabled={isActive}
              >
                <option value="custom">Custom RTMP</option>
                <option value="youtube">YouTube Live</option>
                <option value="facebook">Facebook Live</option>
              </select>
            </div>
            {destination.platform === "youtube" ? (() => {
              const broadcast = normalizeYouTubeBroadcastSettings(destination.broadcast);
              return (
                <fieldset className="youtube-broadcast-setup" disabled={isActive || authorizingId === destination.id}>
                  <legend>YouTube Broadcast Setup</legend>
                  <p className="field-help">
                    These settings are applied when OpenChurch creates the broadcast. Connect again only when you intentionally want a new broadcast.
                  </p>
                  <div className="field">
                    <label htmlFor={`youtube-title-${index}`}>Broadcast Title *</label>
                    <input
                      id={`youtube-title-${index}`}
                      maxLength={100}
                      placeholder="Sunday Worship Service"
                      value={broadcast.title}
                      onChange={(event) => updateYouTubeBroadcast(destination, { title: event.target.value })}
                    />
                    <span className="field-help">{broadcast.title.length}/100 characters</span>
                  </div>
                  <div className="field">
                    <label htmlFor={`youtube-description-${index}`}>Description</label>
                    <textarea
                      id={`youtube-description-${index}`}
                      maxLength={5000}
                      rows={3}
                      placeholder="Service details, speakers, links, and contact information"
                      value={broadcast.description}
                      onChange={(event) => updateYouTubeBroadcast(destination, { description: event.target.value })}
                    />
                  </div>
                  <div className="youtube-broadcast-grid">
                    <div className="field">
                      <label htmlFor={`youtube-visibility-${index}`}>Visibility</label>
                      <select
                        id={`youtube-visibility-${index}`}
                        value={broadcast.visibility}
                        onChange={(event) => updateYouTubeBroadcast(destination, {
                          visibility: event.target.value as YouTubeBroadcastSettings["visibility"]
                        })}
                      >
                        <option value="public">Public (listed and searchable)</option>
                        <option value="unlisted">Unlisted (anyone with the link)</option>
                        <option value="private">Private (hidden)</option>
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor={`youtube-category-${index}`}>Category</label>
                      <select
                        id={`youtube-category-${index}`}
                        value={broadcast.categoryId}
                        onChange={(event) => updateYouTubeBroadcast(destination, { categoryId: event.target.value })}
                      >
                        {YOUTUBE_VIDEO_CATEGORIES.map((category) => (
                          <option key={category.id || "default"} value={category.id}>{category.label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor={`youtube-audience-${index}`}>Audience</label>
                      <select
                        id={`youtube-audience-${index}`}
                        value={broadcast.madeForKids ? "kids" : "not-kids"}
                        onChange={(event) => updateYouTubeBroadcast(destination, {
                          madeForKids: event.target.value === "kids"
                        })}
                      >
                        <option value="not-kids">No, not made for kids</option>
                        <option value="kids">Yes, made for kids</option>
                      </select>
                    </div>
                    <div className="field">
                      <label htmlFor={`youtube-scheduled-${index}`}>Scheduled Start</label>
                      <input
                        id={`youtube-scheduled-${index}`}
                        type="datetime-local"
                        value={broadcast.scheduledStartTime}
                        onChange={(event) => updateYouTubeBroadcast(destination, { scheduledStartTime: event.target.value })}
                      />
                      <span className="field-help">Leave blank to schedule five minutes from creation.</span>
                    </div>
                    <div className="field">
                      <label htmlFor={`youtube-latency-${index}`}>Latency</label>
                      <select
                        id={`youtube-latency-${index}`}
                        value={broadcast.latencyPreference}
                        onChange={(event) => updateYouTubeBroadcast(destination, {
                          latencyPreference: event.target.value as YouTubeBroadcastSettings["latencyPreference"]
                        })}
                      >
                        <option value="normal">Normal (most reliable)</option>
                        <option value="low">Low (balanced)</option>
                        <option value="ultraLow">Ultra low (fast interaction)</option>
                      </select>
                    </div>
                  </div>
                  <div className="youtube-option-grid">
                    <label><input type="checkbox" checked={broadcast.enableDvr} onChange={(event) => updateYouTubeBroadcast(destination, { enableDvr: event.target.checked })} /> Enable viewer DVR</label>
                    <label><input type="checkbox" checked={broadcast.enableAutoStart} onChange={(event) => updateYouTubeBroadcast(destination, { enableAutoStart: event.target.checked })} /> Auto-start on signal</label>
                    <label><input type="checkbox" checked={broadcast.enableAutoStop} onChange={(event) => updateYouTubeBroadcast(destination, { enableAutoStop: event.target.checked })} /> Auto-stop after signal ends</label>
                    <label><input type="checkbox" checked={broadcast.enableEmbed} onChange={(event) => updateYouTubeBroadcast(destination, { enableEmbed: event.target.checked })} /> Allow embedding</label>
                  </div>
                  {destination.providerBroadcastId ? (
                    <div className="broadcast-ready-note">Broadcast ready: {destination.providerBroadcastId}</div>
                  ) : null}
                </fieldset>
              );
            })() : null}
            {destination.platform === "youtube" || destination.platform === "facebook" ? (
              <div className="stream-authorization">
                <button className="btn btn-outline" onClick={() => authorizeDestination(destination)} disabled={isActive || authorizingId === destination.id}>
                  {authorizingId === destination.id
                    ? "Connecting..."
                    : destination.platform === "youtube"
                      ? destination.authorizedAccount ? destination.providerBroadcastId ? "Create Another YouTube Broadcast" : "Create YouTube Broadcast" : "Connect & Create YouTube Broadcast"
                      : destination.authorizedAccount ? "Use Connected Facebook Account" : "Connect Facebook Account"}
                </button>
                {destination.authorizedAccount ? (
                  <button className="btn btn-outline" onClick={() => authorizeDestination(destination, true)} disabled={isActive || authorizingId === destination.id}>Change Account</button>
                ) : null}
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
          checked={settings.rememberStreamKey && secureStorageAvailable === true}
          onChange={(event) => handleRememberToggle(event.target.checked)}
          disabled={secureStorageAvailable !== true}
        />
      </div>
      {secureStorageAvailable === false ? <div className="field-help">Stream keys stay in memory for this session because secure OS credential storage is unavailable.</div> : null}
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
          <option value={15}>15 fps</option>
          <option value={24}>24 fps</option>
          <option value={25}>25 fps</option>
          <option value={30}>30 fps</option>
          <option value={50}>50 fps</option>
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
          <option value="auto">Auto (best tested encoder)</option>
          {STREAMING_ENCODER_OPTIONS.map((option) => {
            const available = availableEncoders.includes(option.id);
            return (
              <option key={option.id} value={option.id} disabled={!available}>
                {option.label} {available ? "" : "(Unavailable)"}
              </option>
            );
          })}
        </select>
        <span className="field-help">
          Hardware options are enabled only after a real local encoding test. Auto falls through to the next working encoder and always keeps software x264 as a fallback.
        </span>
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
            ) ||
            settings.streamDestinations.some(
              (destination) => destination.enabled && destination.platform === "youtube" && !destination.providerBroadcastId
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

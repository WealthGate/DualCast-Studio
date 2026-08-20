import React, { useEffect, useState } from "react";
import { AudioMode, Source } from "../../shared/types";
import { useAudioMeterLevels } from "../audioMeterBus";
import { useAppStore } from "../store/useAppStore";

const supportsAudio = (source: Source) =>
  source.type === "display" ||
  source.type === "window" ||
  source.type === "video" ||
  source.type === "audio";

type MicrophoneDevice = { deviceId: string; label: string };

const Meter: React.FC<{ id: string; label: string }> = ({ id, label }) => {
  const meters = useAudioMeterLevels();
  const level = meters[id] ?? { left: 0, right: 0, channels: 1 as const, clipping: false };
  return (
    <div
      className={`mixer-meter ${level.channels === 1 ? "mono" : "stereo"} ${level.clipping ? "clipping" : ""}`}
      aria-label={`${label}: ${level.channels === 1 ? "mono" : "stereo"}${level.clipping ? ", clipping" : ""}`}
    >
      <span className="meter-scale meter-safe" />
      <span className="meter-scale meter-warning" />
      <span className="meter-scale meter-clip" />
      <span className="meter-bar meter-left" style={{ height: `${level.left * 100}%` }} />
      {level.channels === 2 ? <span className="meter-bar meter-right" style={{ height: `${level.right * 100}%` }} /> : null}
      <small>{level.channels === 1 ? "M" : "L R"}</small>
    </div>
  );
};

const AudioMixerPanel: React.FC = () => {
  const {
    sources,
    settings,
    updateSettings,
    updateSource,
    toggleSourceAudio,
    persistStudioState
  } = useAppStore();
  const [microphones, setMicrophones] = useState<MicrophoneDevice[]>([]);
  const audioSources = Object.values(sources).filter(supportsAudio);
  const microphoneEnabled = settings.audioMode === "microphone" || settings.audioMode === "both";

  useEffect(() => {
    const refresh = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        setMicrophones(
          devices
            .filter((device) => device.kind === "audioinput")
            .map((device, index) => ({
              deviceId: device.deviceId,
              label: device.label || `Microphone ${index + 1}`
            }))
        );
      } catch {
        setMicrophones([]);
      }
    };
    void refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    return () => navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
  }, []);

  const persistSourceUpdate = (sourceId: string, update: Partial<Source>) => {
    updateSource(sourceId, update);
    persistStudioState().catch(() => undefined);
  };

  return (
    <section className="compact-dock-panel audio-mixer-panel">
      <div className="mixer-routing">
        <label>
          Program audio
          <select
            value={settings.audioMode}
            onChange={(event) => updateSettings({ audioMode: event.target.value as AudioMode })}
          >
            <option value="system">Scene audio sources</option>
            <option value="microphone">Mic - all scenes</option>
            <option value="both">Scene sources + Mic</option>
            <option value="none">Mute all</option>
          </select>
        </label>
        <label>
          Persistent microphone
          <select
            value={settings.microphoneDeviceId ?? ""}
            onChange={(event) => updateSettings({ microphoneDeviceId: event.target.value || null })}
          >
            <option value="">System default</option>
            {microphones.map((microphone) => (
              <option key={microphone.deviceId} value={microphone.deviceId}>{microphone.label}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="mixer-master">
        <div>
          <strong>Program Master</strong>
          <span>{Math.round(settings.masterAudioGain * 100)}%</span>
        </div>
        <Meter id="master" label="Program master" />
        <input
          aria-label="Master Program audio"
          type="range"
          min={0}
          max={2}
          step={0.05}
          value={settings.masterAudioGain}
          onChange={(event) => updateSettings({ masterAudioGain: Number(event.target.value) })}
        />
      </div>
      <div className="mixer-channels">
        <div className={`mixer-channel ${microphoneEnabled ? "active" : "muted"}`}>
          <div className="mixer-channel-name" title="Persistent microphone">Mic - All Scenes</div>
          <Meter id="microphone" label="Persistent microphone" />
          <input
            aria-label="Persistent microphone volume"
            className="mixer-fader"
            type="range"
            min={0}
            max={2}
            step={0.05}
            value={settings.microphoneGain}
            onChange={(event) => updateSettings({ microphoneGain: Number(event.target.value) })}
          />
          <span className="mixer-value">{Math.round(settings.microphoneGain * 100)}% - Persistent</span>
          <button
            className={`mixer-mute ${microphoneEnabled ? "" : "active"}`}
            onClick={() => updateSettings({ audioMode: microphoneEnabled ? "system" : "both" })}
          >
            {microphoneEnabled ? "Mute Mic" : "Enable Mic"}
          </button>
        </div>
        {audioSources.map((source) => (
          <div key={source.id} className={`mixer-channel ${source.audioEnabled ? "active" : "muted"}`}>
            <div className="mixer-channel-name" title={source.name}>{source.name}</div>
            <Meter id={source.id} label={source.name} />
            <input
              aria-label={`${source.name} volume`}
              className="mixer-fader"
              type="range"
              min={0}
              max={2}
              step={0.05}
              value={source.volume ?? 1}
              onChange={(event) => updateSource(source.id, { volume: Number(event.target.value) })}
              onPointerUp={() => persistStudioState().catch(() => undefined)}
              onKeyUp={() => persistStudioState().catch(() => undefined)}
              onBlur={() => persistStudioState().catch(() => undefined)}
            />
            <span className="mixer-value">{Math.round((source.volume ?? 1) * 100)}%</span>
            <select
              className="mixer-scope"
              aria-label={`${source.name} routing`}
              value={source.audioScope ?? "scene"}
              onChange={(event) => persistSourceUpdate(source.id, { audioScope: event.target.value as "scene" | "persistent" })}
            >
              <option value="scene">This scene</option>
              <option value="persistent">All scenes</option>
            </select>
            <button
              className={`mixer-mute ${source.audioEnabled ? "" : "active"}`}
              onClick={() => {
                toggleSourceAudio(source.id);
                persistStudioState().catch(() => undefined);
              }}
            >
              {source.audioEnabled ? "Mute" : "Unmute"}
            </button>
          </div>
        ))}
      </div>
      <p className="mixer-help">Meters move only with real signal. Yellow is a warning; red CLIP means lower the channel or master gain.</p>
    </section>
  );
};

export default AudioMixerPanel;

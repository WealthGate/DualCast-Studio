import React from "react";
import { Source } from "../../shared/types";
import { useAppStore } from "../store/useAppStore";

const supportsAudio = (source: Source) =>
  source.type === "display" ||
  source.type === "window" ||
  source.type === "video" ||
  source.type === "audio";

const AudioMixerPanel: React.FC = () => {
  const {
    sources,
    settings,
    updateSettings,
    updateSource,
    toggleSourceAudio,
    persistStudioState
  } = useAppStore();
  const audioSources = Object.values(sources).filter(supportsAudio);

  return (
    <section className="compact-dock-panel audio-mixer-panel">
      <div className="mixer-master">
        <div>
          <strong>Program Master</strong>
          <span>{Math.round(settings.masterAudioGain * 100)}%</span>
        </div>
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
        {audioSources.map((source) => (
          <div key={source.id} className={`mixer-channel ${source.audioEnabled ? "active" : "muted"}`}>
            <div className="mixer-channel-name" title={source.name}>{source.name}</div>
            <div className="mixer-meter" aria-hidden="true">
              <span style={{ height: `${Math.min(100, (source.volume ?? 1) * 50)}%` }} />
            </div>
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
        {audioSources.length === 0 ? (
          <div className="dock-empty-state">Add a display, video, or audio source to create mixer channels.</div>
        ) : null}
      </div>
    </section>
  );
};

export default AudioMixerPanel;

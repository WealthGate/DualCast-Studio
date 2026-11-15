import React, { useEffect, useRef, useState } from "react";
import { AudioMode, Source } from "../../shared/types";
import {
  AudioInputLine, AudioInputPreset, audioInputMeterId, audioInputPresets, maxAdditionalAudioInputs, maxAudioInputChannels
} from "../../shared/programAudio";
import { useAudioMeterLevels } from "../audioMeterBus";
import { useAppStore } from "../store/useAppStore";
import ProgramEqualizerControls from "./ProgramEqualizerControls";
import AudioPluginsPanel from "./AudioPluginsPanel";

const supportsAudio = (source: Source) =>
  source.type === "display" ||
  source.type === "window" ||
  source.type === "video" ||
  source.type === "audio";

type MicrophoneDevice = { deviceId: string; label: string };

const Meter: React.FC<{ id: string; label: string; horizontal?: boolean }> = ({ id, label, horizontal }) => {
  const meters = useAudioMeterLevels();
  const level = meters[id] ?? { left: 0, right: 0, channels: 1 as const, clipping: false };
  return (
    <div
      className={`mixer-meter ${horizontal ? "horizontal" : ""} ${level.channels === 1 ? "mono" : "stereo"} ${level.clipping ? "clipping" : ""}`}
      aria-label={`${label}: ${level.channels === 1 ? "mono" : "stereo"}${level.clipping ? ", clipping" : ""}`}
    >
      <span className="meter-scale meter-safe" />
      <span className="meter-scale meter-warning" />
      <span className="meter-scale meter-clip" />
      <span className="meter-bar meter-left" style={{ [horizontal ? "width" : "height"]: `${level.left * 100}%` }} />
      {level.channels === 2 ? <span className="meter-bar meter-right" style={{ [horizontal ? "width" : "height"]: `${level.right * 100}%` }} /> : null}
      <small>{level.channels === 1 ? "M" : "L R"}</small>
    </div>
  );
};

const Fader: React.FC<{
  label: string; gain: number; onChange: (gain: number) => void; onCommit?: () => void; max?: number; disabled?: boolean;
}> = ({ label, gain, onChange, onCommit, max = 2, disabled }) => (
  <input className="mixer-fader" aria-label={label} aria-valuetext={`${Math.round(gain * 100)} percent`}
    type="range" min={0} max={max} step={0.05} value={gain} disabled={disabled}
    onChange={event => onChange(Number(event.target.value))}
    onPointerUp={onCommit} onKeyUp={onCommit} onBlur={onCommit} />
);

const InputStatus: React.FC<{ id: string; wholeDevice: boolean }> = ({ id, wholeDevice }) => {
  const meters = useAudioMeterLevels();
  if (meters[id]) return null;
  return <span className="mixer-input-status">{wholeDevice ? "Waiting for input" : "Waiting for device channel"}</span>;
};

const presets = Object.entries(audioInputPresets) as [AudioInputPreset, (typeof audioInputPresets)[AudioInputPreset]][];
const inputChannels = Array.from({ length: maxAudioInputChannels }, (_, index) => index + 1);

const InputLineControls: React.FC<{
  line: AudioInputLine;
  meterId: string;
  enabled: boolean;
  devices: MicrophoneDevice[];
  onChange: (update: Partial<AudioInputLine>) => void;
  onRemove?: () => void;
  openSettings?: boolean;
}> = ({ line, meterId, enabled, devices, onChange, onRemove, openSettings }) => {
  const [draftName, setDraftName] = useState(line.name);
  const nameInput = useRef<HTMLInputElement>(null);
  useEffect(() => setDraftName(line.name), [line.name]);
  useEffect(() => {
    if (openSettings) nameInput.current?.focus();
  }, [openSettings]);
  const saveName = (value: string) => {
    const name = value.trim() || line.name;
    setDraftName(name);
    if (name !== line.name) onChange({ name });
  };
  const deviceMissing = line.deviceId && !devices.some(device => device.deviceId === line.deviceId);

  return (
    <article className="mixer-input-line" aria-label={line.name}>
      <div className="mixer-input-heading">
        <strong>{line.name}</strong>
        <output>{Math.round(line.gain * 100)}%</output>
        <button type="button" className={`mixer-mute ${line.muted ? "active" : ""}`}
          aria-label={`Mute ${line.name}`} aria-pressed={line.muted}
          onClick={() => onChange({ muted: !line.muted })}>{line.muted ? "Muted" : "Mute"}</button>
      </div>
      <Meter id={meterId} label={line.name} horizontal />
      <Fader label={`${line.name} volume`} gain={line.gain} onChange={gain => onChange({ gain })} />
      <div role="group" aria-label={`${line.name} effect`} className="mixer-preset-buttons">
        {presets.map(([key, preset]) => (
          <button key={key} type="button" className="btn btn-outline" title={preset.description}
            aria-pressed={line.preset === key} onClick={() => onChange({ preset: key })}>{preset.label}</button>
        ))}
      </div>
      {enabled && !line.muted ? <InputStatus id={meterId} wholeDevice={line.channel === null} /> : null}
      <details className="mixer-input-settings" open={openSettings}>
        <summary>Input settings</summary>
        <div className="mixer-input-fields">
          {onRemove ? <label>
            Name
            <input ref={nameInput} type="text" aria-label={`${line.name} name`} value={draftName} maxLength={64}
              onChange={event => setDraftName(event.target.value)} onBlur={event => saveName(event.currentTarget.value)}
              onKeyDown={event => { if (event.key === "Enter") event.currentTarget.blur(); }} />
          </label> : null}
          <label>
            Device
            <select aria-label={`${line.name} device`} value={line.deviceId ?? ""}
              onChange={event => onChange({ deviceId: event.target.value || null, channel: null })}>
              <option value="">System default</option>
              {deviceMissing ? <option value={line.deviceId!}>Disconnected input</option> : null}
              {devices.map(device => <option key={device.deviceId} value={device.deviceId}>{device.label}</option>)}
            </select>
          </label>
          <label>
            Channel
            <select aria-label={`${line.name} channel`} value={line.channel ?? ""}
              onChange={event => onChange({ channel: Number(event.target.value) || null })}>
              <option value="">Device mix</option>
              {inputChannels.map(channel => <option key={channel} value={channel}>Channel {channel}</option>)}
            </select>
          </label>
          {onRemove ? <button type="button" className="btn btn-outline" aria-label={`Remove ${line.name}`}
            onClick={onRemove}>Remove line</button> : null}
        </div>
      </details>
    </article>
  );
};

const AudioMixerPanel: React.FC = () => {
  const {
    sources,
    settings,
    updateSettings,
    updateSource,
    toggleSourceAudio,
    persistStudioState,
    programAudioStream,
    isProgramAudioMonitoring,
    programAudioMonitorGain,
    setProgramAudioMonitoring,
    setProgramAudioMonitorGain
  } = useAppStore();
  const [microphones, setMicrophones] = useState<MicrophoneDevice[]>([]);
  const [newLineId, setNewLineId] = useState<string>();
  const [settingsError, setSettingsError] = useState("");
  const audioSources = Object.values(sources).filter(supportsAudio);
  const microphoneEnabled = settings.audioMode === "microphone" || settings.audioMode === "both";
  const lines = settings.audioInputLines ?? [];

  useEffect(() => {
    let revision = 0;
    const refresh = async () => {
      const request = ++revision;
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        if (request !== revision) return;
        setMicrophones(
          devices
            .filter((device) => device.kind === "audioinput" && device.deviceId && device.deviceId !== "default")
            .map((device, index) => ({
              deviceId: device.deviceId,
              label: device.label || `Audio input ${index + 1}`
            }))
        );
      } catch {
        if (request === revision) setMicrophones([]);
      }
    };
    void refresh();
    navigator.mediaDevices?.addEventListener?.("devicechange", refresh);
    return () => {
      revision += 1;
      navigator.mediaDevices?.removeEventListener?.("devicechange", refresh);
    };
  }, [microphoneEnabled]);

  const saveSettings: typeof updateSettings = async patch => {
    setSettingsError("");
    try { await updateSettings(patch); }
    catch { setSettingsError("Could not save the mixer change. Try again."); }
  };
  const editLine = (id: string, update: Partial<AudioInputLine>) => {
    const current = useAppStore.getState().settings.audioInputLines ?? [];
    void saveSettings({ audioInputLines: current.map(line => line.id === id ? { ...line, ...update } : line) });
  };
  const addLine = () => {
    const currentSettings = useAppStore.getState().settings;
    const current = currentSettings.audioInputLines ?? [];
    if (current.length >= maxAdditionalAudioInputs) return;
    const usedDevices = new Set([currentSettings.microphoneDeviceId, ...current.map(line => line.deviceId)]);
    const deviceId = microphones.find(device => !usedDevices.has(device.deviceId))?.deviceId ?? null;
    const id = crypto.randomUUID();
    let number = 2;
    while (current.some(line => line.name === `Input ${number}`)) number += 1;
    const line: AudioInputLine = { id, name: `Input ${number}`, deviceId, channel: null, gain: 1, muted: true, preset: "clean" };
    setNewLineId(id);
    void saveSettings({ audioInputLines: [...current, line] });
  };

  const persistSourceUpdate = (sourceId: string, update: Partial<Source>) => {
    updateSource(sourceId, update);
    persistStudioState().catch(() => undefined);
  };

  return (
    <section className="compact-dock-panel audio-mixer-panel">
      <div className="mixer-master">
        <div className="mixer-master-heading">
          <strong>Program Master</strong>
          <output>{Math.round(settings.masterAudioGain * 100)}%</output>
        </div>
        <Meter id="master" label="Program master" horizontal />
        <Fader label="Master Program audio" gain={settings.masterAudioGain}
          onChange={masterAudioGain => { void saveSettings({ masterAudioGain }); }} />
      </div>
      <div className="mixer-routing">
        <label>
          Program audio
          <select
            value={settings.audioMode}
            onChange={(event) => saveSettings({ audioMode: event.target.value as AudioMode })}
          >
            <option value="system">Scene audio sources</option>
            <option value="microphone">Input lines (all scenes)</option>
            <option value="both">Scene sources + input lines</option>
            <option value="none">Mute all</option>
          </select>
        </label>
      </div>
      <section className="mixer-inputs" aria-label="Audio input lines">
        <div className="mixer-inputs-toolbar">
          <strong>Mic &amp; instrument lines</strong>
          <button type="button" className="btn btn-outline" onClick={addLine}
            disabled={lines.length >= maxAdditionalAudioInputs}>Add input line</button>
        </div>
        {settingsError ? <p role="alert" className="mixer-input-status">{settingsError}</p> : null}
        {!microphoneEnabled ? <p className="field-help">Choose a Program audio mode that includes input lines to send them to Program.</p> : null}
        {lines.length >= maxAdditionalAudioInputs ? <p className="field-help">All eight input lines are in use.</p> : null}
        <InputLineControls meterId="microphone" devices={microphones} enabled={microphoneEnabled}
          line={{ id: "microphone", name: "Primary microphone", deviceId: settings.microphoneDeviceId === "default" ? null : settings.microphoneDeviceId,
            channel: settings.microphoneChannel ?? null, gain: settings.microphoneGain,
            muted: settings.microphoneMuted ?? false, preset: settings.microphonePreset ?? "clean" }}
          onChange={patch => { void saveSettings({
            ...(patch.deviceId !== undefined ? { microphoneDeviceId: patch.deviceId } : {}),
            ...(patch.channel !== undefined ? { microphoneChannel: patch.channel } : {}),
            ...(patch.gain !== undefined ? { microphoneGain: patch.gain } : {}),
            ...(patch.muted !== undefined ? { microphoneMuted: patch.muted } : {}),
            ...(patch.preset !== undefined ? { microphonePreset: patch.preset } : {})
          }); }}
        />
        {lines.map(line => <InputLineControls key={line.id} line={line} meterId={audioInputMeterId(line.id)}
          enabled={microphoneEnabled} devices={microphones} openSettings={newLineId === line.id || undefined}
          onChange={patch => editLine(line.id, patch)} onRemove={() => {
            const current = useAppStore.getState().settings.audioInputLines ?? [];
            void saveSettings({ audioInputLines: current.filter(input => input.id !== line.id) });
          }} />)}
      </section>
      {audioSources.length > 0 ? <div className="mixer-channels" aria-label="Scene audio sources">
        {audioSources.map((source) => (
          <div key={source.id} className={`mixer-channel ${source.audioEnabled ? "active" : "muted"}`}>
            <div className="mixer-channel-name" title={source.name}>{source.name}</div>
            <Meter id={source.id} label={source.name} />
            <Fader label={`${source.name} volume`} gain={source.volume ?? 1}
              onChange={volume => updateSource(source.id, { volume })}
              onCommit={() => persistStudioState().catch(() => undefined)} />
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
      </div> : null}
      <ProgramEqualizerControls />
      <div className="mixer-output-mode">
        <span>Program output</span>
        <button type="button" className="btn btn-outline"
          aria-label={`Program output: ${settings.audioChannelMode === "mono" ? "Mono" : "Stereo"}. Toggle mono and stereo`}
          aria-pressed={settings.audioChannelMode === "mono"}
          onClick={() => saveSettings({ audioChannelMode: settings.audioChannelMode === "mono" ? "stereo" : "mono" })}>
          {settings.audioChannelMode === "mono" ? "Mono" : "Stereo"}
        </button>
        <span className="field-help">Mono sends the combined mix to both speakers. Stereo preserves left and right.</span>
      </div>
      <div className="mixer-monitor">
        <button type="button" className={`monitor-toggle ${isProgramAudioMonitoring ? "active" : ""}`}
          aria-pressed={isProgramAudioMonitoring} onClick={() => setProgramAudioMonitoring(!isProgramAudioMonitoring)}>
          {isProgramAudioMonitoring ? "Stop Listening" : "Listen to Program"}
        </button>
        <label>
          Monitor volume
          <Fader label="Local Program monitor volume" gain={programAudioMonitorGain} max={1}
            disabled={!isProgramAudioMonitoring} onChange={setProgramAudioMonitorGain} />
          <span>{Math.round(programAudioMonitorGain * 100)}%</span>
        </label>
        <span className={`monitor-status ${programAudioStream ? "ready" : "waiting"}`}>
          {programAudioStream ? "Program audio ready" : "Waiting for Program audio"}
        </span>
        <p>Use headphones to prevent feedback. Monitor volume affects only what you hear locally.</p>
      </div>
      <p className="mixer-help">Lower the channel or master fader if its meter shows CLIP.</p>
      <AudioPluginsPanel />
    </section>
  );
};

export default AudioMixerPanel;

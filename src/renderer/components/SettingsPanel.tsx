import React from "react";
import { useAppStore } from "../store/useAppStore";
import { FrameRatePreset, QualityPreset } from "../../shared/types";

const SettingsPanel: React.FC = () => {
  const { settings, updateSettings } = useAppStore();

  const handleDirectoryChange = async () => {
    const selected = await window.dualcast.selectSaveDirectory();
    if (selected) {
      updateSettings({ saveDirectory: selected });
    }
  };

  return (
    <section className="panel settings-panel">
      <h2>Settings</h2>
      <div className="field">
        <label>Save directory</label>
        <div className="field-row">
          <span className="path">{settings.saveDirectory || "Not set"}</span>
          <button className="btn btn-outline" onClick={handleDirectoryChange}>
            Change
          </button>
        </div>
      </div>
      <div className="field">
        <label htmlFor="masterAudioGain">
          Master Program Audio ({Math.round(settings.masterAudioGain * 100)}%)
        </label>
        <input
          id="masterAudioGain"
          type="range"
          min={0}
          max={2}
          step={0.01}
          value={settings.masterAudioGain}
          onChange={(event) => updateSettings({ masterAudioGain: Number(event.target.value) })}
        />
      </div>
      <div className="field">
        <label htmlFor="quality">Quality</label>
        <select
          id="quality"
          value={settings.qualityPreset}
          onChange={(event) => updateSettings({ qualityPreset: event.target.value as QualityPreset })}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor="frameRate">Frame rate</label>
        <select
          id="frameRate"
          value={settings.frameRate}
          onChange={(event) => updateSettings({ frameRate: Number(event.target.value) as FrameRatePreset })}
        >
          <option value={30}>30 fps</option>
          <option value={60}>60 fps</option>
        </select>
      </div>
    </section>
  );
};

export default SettingsPanel;

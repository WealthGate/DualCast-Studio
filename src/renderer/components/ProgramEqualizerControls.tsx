import React from "react";
import { defaultProgramEqualizer, normalizeProgramEqualizer, ProgramEqualizerSettings } from "../../shared/programAudio";
import { useAppStore } from "../store/useAppStore";
import "./programEqualizer.css";

const bands = [
  { key: "lowGainDb", label: "Bass", frequency: "180 Hz" },
  { key: "midGainDb", label: "Mid", frequency: "1 kHz" },
  { key: "highGainDb", label: "Treble", frequency: "6 kHz" }
] as const;

const ProgramEqualizerControls: React.FC = () => {
  const value = useAppStore(state => state.settings.audioEqualizer);
  const updateSettings = useAppStore(state => state.updateSettings);
  const eq = normalizeProgramEqualizer(value);
  const update = (patch: Partial<ProgramEqualizerSettings>) => void updateSettings({ audioEqualizer: { ...eq, ...patch } });
  return (
    <section className="program-equalizer" aria-label="Program audio equalizer">
      <div className="program-equalizer-heading">
        <strong>Program Equalizer</strong>
        <button type="button" className="btn btn-outline" aria-pressed={eq.enabled}
          onClick={() => update({ enabled: !eq.enabled })}>{eq.enabled ? "EQ on" : "EQ bypassed"}</button>
        <button type="button" className="btn btn-outline"
          onClick={() => update({ ...defaultProgramEqualizer, enabled: eq.enabled })}>Reset flat</button>
      </div>
      <div className="program-equalizer-bands">
        {bands.map(band => (
          <label key={band.key}>
            <span>{band.label} <small>{band.frequency}</small></span>
            <input type="range" min={-12} max={12} step={0.5} value={eq[band.key]} disabled={!eq.enabled}
              aria-label={`Program equalizer ${band.label.toLowerCase()}`} aria-valuetext={`${eq[band.key]} decibels`}
              onChange={event => update({ [band.key]: Number(event.target.value) })} />
            <output>{eq[band.key] > 0 ? "+" : ""}{eq[band.key].toFixed(1)} dB</output>
          </label>
        ))}
      </div>
      <p className="field-help">Applies to the stream, recording and Program monitor. Start flat and watch the master meter when boosting.</p>
    </section>
  );
};

export default ProgramEqualizerControls;

import React, { useEffect, useState } from "react";
import { SanctuaryDisplaySettings } from "../../shared/types";
import { normalizeSanctuaryDisplay } from "../../shared/sanctuaryDisplay";
import { useAppStore } from "../store/useAppStore";
import { getSanctuaryDisplayState } from "../utils/sanctuaryContent";
import SanctuaryLayout from "./SanctuaryLayout";

const SanctuaryLayoutEditor: React.FC<{ onOpenBackgrounds?: () => void }> = ({ onOpenBackgrounds }) => {
  const state = useAppStore();
  const [draft, setDraft] = useState(() => normalizeSanctuaryDisplay(state.settings.sanctuaryDisplay));
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const savedConfig = JSON.stringify(normalizeSanctuaryDisplay(state.settings.sanctuaryDisplay));
  useEffect(() => { setDraft(normalizeSanctuaryDisplay(JSON.parse(savedConfig))); }, [savedConfig]);
  const edit = (update: Partial<SanctuaryDisplaySettings>) => { setDraft(current => ({ ...current, ...update })); setMessage("Layout changes are shown below. Apply to update the sanctuary screens."); };
  const apply = async (config = draft) => {
    setSaving(true);
    try {
      await state.updateSettings({ sanctuaryDisplay: normalizeSanctuaryDisplay(config) });
      setMessage(config.mode === "program" ? "Default layout set to Mirror Program. Background assignments keep their own display layout." : "Independent text layout applied to sanctuary screens.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Unable to save the sanctuary layout."); }
    finally { setSaving(false); }
  };
  const preview = getSanctuaryDisplayState({ ...state, settings: { ...state.settings, sanctuaryDisplay: draft } });
  return <section className="sanctuary-layout-editor" aria-label="Sanctuary display layout">
    <h3>Sanctuary display layout</h3>
    {onOpenBackgrounds && <button onClick={onOpenBackgrounds}>Background library & display assignments…</button>}
    <p className="field-help">Backgrounds manages images, videos and per-screen assignments. Assigned backgrounds take precedence over the default mode below; restore the shared layout there to mirror Program again.</p>
    <label className="field">Display mode
      <select aria-label="Sanctuary display mode" value={draft.mode} disabled={saving} onChange={event => {
        const next = { ...draft, mode: event.target.value as SanctuaryDisplaySettings["mode"] };
        setDraft(next); void apply(next);
      }}><option value="program">Mirror Program</option><option value="independent">Independent Layout</option></select>
    </label>
    {draft.mode === "program" ? <p className="field-help">The sanctuary screens receive the same picture as Program. Select Independent Layout to style their background and text separately.</p> : <>
      <label className="field">Sanctuary text
        <select aria-label="Sanctuary text source" value={draft.textSource} onChange={event => edit({ textSource: event.target.value as "program" | "custom" })}>
          <option value="program">Follow live Program text</option><option value="custom">Sanctuary-only text</option>
        </select>
      </label>
      {draft.textSource === "custom" && <label className="field">Sanctuary-only text<textarea value={draft.customText} onChange={event => edit({ customText: event.target.value })} /></label>}
      <p className="field-help">Following Program uses its live Scripture, lyrics, or scene text with the sanctuary styling below. Program and recordings keep their own layout.</p>
      <div className="field-grid">
        <label className="field">Font<input value={draft.fontFamily} onChange={event => edit({ fontFamily: event.target.value })} /></label>
        <label className="field">Font size (at 1920 px)<input type="number" min={12} max={240} value={draft.fontSize} onChange={event => edit({ fontSize: Number(event.target.value) })} /></label>
        <label className="field">Text color<input type="color" value={draft.textColor} onChange={event => edit({ textColor: event.target.value })} /></label>
        <label className="field">Text alignment<select value={draft.textAlign} onChange={event => edit({ textAlign: event.target.value as SanctuaryDisplaySettings["textAlign"] })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
        <label className="field">Vertical alignment<select value={draft.verticalAlign} onChange={event => edit({ verticalAlign: event.target.value as SanctuaryDisplaySettings["verticalAlign"] })}><option value="top">Top</option><option value="center">Center</option><option value="bottom">Bottom</option></select></label>
      </div>
      <div className="sanctuary-style-options">
        <label><input type="checkbox" checked={draft.bold} onChange={event => edit({ bold: event.target.checked })} /> Bold</label>
        <label><input type="checkbox" checked={draft.italic} onChange={event => edit({ italic: event.target.checked })} /> Italic</label>
      </div>
      <details><summary>Text position and size</summary><div className="field-grid">
        {([ ["x", "Left (%)"], ["y", "Top (%)"], ["width", "Width (%)"], ["height", "Height (%)"] ] as const).map(([key, label]) => <label className="field" key={key}>{label}<input type="number" min={key === "x" || key === "y" ? 0 : 5} max={100} value={draft.textRect[key]} onChange={event => edit({ textRect: { ...draft.textRect, [key]: Number(event.target.value) } })} /></label>)}
      </div></details>
      <strong>Sanctuary layout preview</strong>
      <SanctuaryLayout preview state={{ ...preview, settings: normalizeSanctuaryDisplay(draft) }} />
      <button type="button" className="btn btn-primary" disabled={saving} onClick={() => void apply()}>{saving ? "Applying…" : "Apply Sanctuary Layout"}</button>
    </>}
    {message && <p role="status" className="field-help">{message}</p>}
  </section>;
};
export default SanctuaryLayoutEditor;

import React, { useEffect, useMemo, useRef, useState } from "react";
import { BackgroundMedia, BackgroundSelection, DisplayBackgrounds, emptyBackground, normalizeDisplayBackgrounds } from "../../shared/backgrounds";
import { ProjectionDisplay, Settings } from "../../shared/types";
import { normalizeSanctuaryDisplay } from "../../shared/sanctuaryDisplay";
import { useAppStore } from "../store/useAppStore";
import BackgroundLayer from "./BackgroundLayer";

function selectionFor(settings: Settings, target: string): BackgroundSelection {
  const backgrounds = normalizeDisplayBackgrounds(settings.displayBackgrounds);
  if (target === "program") return backgrounds.program ?? { ...emptyBackground, color: "#000000" };
  if (target === "lowerThird") return backgrounds.lowerThird ?? { ...emptyBackground, color: settings.lowerThird.backgroundColor, kind: settings.lowerThird.backgroundImageUrl ? "image" : "none", url: settings.lowerThird.backgroundImageUrl, opacity: settings.lowerThird.backgroundImageOpacity };
  if (target.startsWith("display:")) {
    const override = backgrounds.displays[target.slice(8)]; if (override) return override;
  }
  if (backgrounds.sanctuary) return backgrounds.sanctuary;
  const config = normalizeSanctuaryDisplay(settings.sanctuaryDisplay);
  return { ...emptyBackground, kind: config.backgroundType === "color" ? "none" : config.backgroundType, url: config.backgroundUrl, fit: config.backgroundFit, color: config.backgroundColor, opacity: 1 - config.backgroundDim };
}

const BackgroundsPanel: React.FC<{ onOpenDisplays?: () => void }> = ({ onOpenDisplays }) => {
  const { settings, updateSettings } = useAppStore();
  const [items, setItems] = useState<BackgroundMedia[]>([]);
  const [displays, setDisplays] = useState<ProjectionDisplay[]>([]);
  const [target, setTarget] = useState("sanctuary");
  const [draft, setDraft] = useState(() => selectionFor(settings, target));
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [previewError, setPreviewError] = useState(false);
  const previewRef = useRef<HTMLDivElement>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  useEffect(() => {
    const element = previewRef.current;
    if (!element) return;
    const observer = new IntersectionObserver(entries => setPreviewVisible(entries.some(entry => entry.isIntersecting)));
    observer.observe(element); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    let active = true;
    const refresh = () => { void window.dualcast.listProjectionDisplays().then(value => { if (active) setDisplays(value); }).catch(error => { if (active) setMessage(String(error)); }); };
    void window.dualcast.listBackgroundMedia().then(value => { if (active) setItems(value); }).catch(error => { if (active) setMessage(String(error)); });
    refresh(); const off = window.dualcast.onProjectionDisplaysChanged(refresh);
    return () => { active = false; off(); };
  }, []);
  useEffect(() => { setDraft(selectionFor(settings, target)); }, [target, settings.displayBackgrounds, settings.lowerThird.backgroundImageUrl, settings.sanctuaryDisplay]);
  useEffect(() => setPreviewError(false), [draft.url, draft.kind]);
  const backgrounds = normalizeDisplayBackgrounds(settings.displayBackgrounds);
  const targets = useMemo(() => [
    { id: "sanctuary", name: "Shared sanctuary background" }, { id: "program", name: "Program / Preview (behind scene sources)" },
    { id: "lowerThird", name: "Lower-third band (Program + lower-third output)" },
    ...displays.map(display => ({ id: `display:${display.id}`, name: `${display.name}${display.isPrimary ? " · Primary" : ""}${settings.lowerThird.enabled && settings.lowerThird.displayId === display.id ? " · Lower-third output" : ""}` })),
    ...Object.keys(backgrounds.displays).filter(id => !displays.some(display => display.id === id)).map(id => ({ id: `display:${id}`, name: `Disconnected display ${id}` }))
  ], [displays, settings.displayBackgrounds, settings.lowerThird.enabled, settings.lowerThird.displayId]);
  const edit = (update: Partial<BackgroundSelection>) => { setDraft(current => ({ ...current, ...update })); setMessage("Changes are staged. Apply when ready."); };
  const upload = async (kind: "image" | "video") => {
    setBusy(true);
    try {
      const result = await window.dualcast.importBackgroundMedia(kind);
      const added = result.items.filter(item => !items.some(existing => existing.id === item.id));
      setItems(result.items);
      setMessage(result.errors.length ? result.errors.join("\n") : added.length ? `${added.length} file(s) added to the shared library. Choose a target and a background, then Apply.` : "No files added.");
    } catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  };
  const apply = async (inherit = false) => {
    setBusy(true);
    try {
      const next: DisplayBackgrounds = normalizeDisplayBackgrounds(useAppStore.getState().settings.displayBackgrounds);
      if (target.startsWith("display:")) { if (inherit) delete next.displays[target.slice(8)]; else next.displays[target.slice(8)] = draft; }
      else if (inherit) delete next[target as "program" | "sanctuary" | "lowerThird"];
      else next[target as "program" | "sanctuary" | "lowerThird"] = draft;
      await updateSettings({ displayBackgrounds: next });
      setMessage(`${inherit ? "Shared / existing layout restored" : "Background applied"} for ${targets.find(item => item.id === target)?.name ?? target}.`);
    } catch (error) { setMessage(String(error)); }
    finally { setBusy(false); }
  };
  return <section className="compact-dock-panel backgrounds-panel" aria-label="Display backgrounds">
    <h3>Background library</h3>
    <p className="field-help">Upload once and choose a different background for each output. Files are copied into OpenChurch on this computer.</p>
    <div className="background-upload-actions"><button disabled={busy} onClick={() => void upload("image")}>Upload images</button><button disabled={busy} onClick={() => void upload("video")}>Upload videos</button></div>
    <label className="field">Display / output<select aria-label="Background destination" value={target} disabled={busy} onChange={event => {
      const id = event.target.value;
      setTarget(settings.lowerThird.enabled && id === `display:${settings.lowerThird.displayId}` ? "lowerThird" : id);
    }}>{targets.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
    {target === "program" ? <p className="field-help">Behind scene sources on Preview and Program, including recordings, streams and Virtual Camera. Full-screen sources cover this background.</p>
      : target === "lowerThird" ? <p className="field-help">Inside the lower-third band while a lower-third slide is visible. Videos loop silently. The rest of the dedicated lower-third output stays transparent.</p>
      : <p className="field-help">A custom sanctuary background uses the independent text layout and follows live Program text. It replaces this display's mirrored Program picture. Other displays keep their assignments.</p>}
    <div className="background-library" role="group" aria-label="Choose background media">
      <button className={draft.kind === "none" ? "selected" : ""} aria-pressed={draft.kind === "none"} onClick={() => edit({ kind: "none", assetId: "", url: "" })}>None · no image or video</button>
      {items.map(item => <button key={item.id} disabled={busy || item.missing} className={draft.assetId === item.id && draft.kind !== "none" ? "selected" : ""} aria-pressed={draft.assetId === item.id && draft.kind !== "none"} onClick={() => edit({ kind: item.kind, assetId: item.id, url: item.url })}>
        {item.kind === "image" && !item.missing ? <img src={item.url} alt="" loading="lazy" /> : <span aria-hidden="true">▶</span>}<span>{item.name}{item.missing ? " (missing)" : ""}<small>{item.kind === "video" ? "Video · muted loop" : "Image"}</small></span>
      </button>)}
    </div>
    {!items.length && <p className="field-help">No uploaded media yet. None works without uploading a file.</p>}
    <div ref={previewRef} className="background-draft-preview" style={{ backgroundColor: draft.color }}><BackgroundLayer background={draft} frozen={!previewVisible} onError={() => setPreviewError(true)} /></div>
    {previewError && <p role="alert">This file cannot be played. Choose another file or convert the video to MP4 (H.264) or WebM.</p>}
    <div className="field-grid">
      <label className="field">Base color<input aria-label="Background base color" type="color" value={draft.color} onChange={event => edit({ color: event.target.value })} /></label>
      <label className="field">Fit<select aria-label="Background fit" value={draft.fit} onChange={event => edit({ fit: event.target.value as "cover" | "contain" })}><option value="cover">Fill / crop edges</option><option value="contain">Fit whole image / video</option></select></label>
    </div>
    <label className="field">Media opacity ({Math.round(draft.opacity * 100)}%)<input aria-label="Background media opacity" type="range" min={0} max={1} step={0.05} value={draft.opacity} onChange={event => edit({ opacity: Number(event.target.value) })} /></label>
    <button className="btn btn-primary" disabled={busy || previewError} onClick={() => void apply()}>{busy ? "Working…" : "Apply background"}</button>
    <button className="btn btn-outline" disabled={busy} onClick={() => void apply(true)}>{target.startsWith("display:") ? "Use shared sanctuary layout" : "Restore existing layout"}</button>
    {onOpenDisplays && <button onClick={onOpenDisplays}>Choose display outputs…</button>}
    <p className="field-help">Assigning a background does not open a display. Select screens and open them in Sanctuary Displays.</p>
    <details><summary>Current assignments</summary><ul>{targets.map(item => <li key={item.id}><strong>{item.name}:</strong> {(() => { const selection = selectionFor(settings, item.id); return selection.kind === "none" ? "None" : items.find(asset => asset.id === selection.assetId)?.name ?? `Existing ${selection.kind}`; })()}</li>)}</ul></details>
    {message && <p role="status" className="field-help" style={{ whiteSpace: "pre-wrap" }}>{message}</p>}
  </section>;
};
export default BackgroundsPanel;

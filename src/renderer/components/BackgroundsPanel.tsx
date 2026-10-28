import React, { useEffect, useRef, useState } from "react";
import { BackgroundMedia, BackgroundSelection, DisplayBackgrounds, emptyBackground, normalizeDisplayBackgrounds, withoutBackgroundMedia } from "../../shared/backgrounds";
import { Settings } from "../../shared/types";
import { normalizeSanctuaryDisplay } from "../../shared/sanctuaryDisplay";
import { useAppStore } from "../store/useAppStore";
import BackgroundLayer from "./BackgroundLayer";
import { parseStudioProfiles, PROFILE_STORAGE_KEY } from "../utils/profiles";
import { useConnectedDisplays } from "../store/useConnectedDisplays";
import { explicitDisplayRouting, modeForDisplay } from "../../shared/displayBackgroundState";

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
  const { settings, updateSettings, isProjecting, projectionTargetIds, isLowerThirdProjecting } = useAppStore();
  const [items, setItems] = useState<BackgroundMedia[]>([]);
  const { displays, error: displayError } = useConnectedDisplays();
  const [target, setTarget] = useState("sanctuary");
  const choseTarget = useRef(false);
  const libraryRevision = useRef(0);
  const lowerThirdActive = settings.lowerThird.enabled || isLowerThirdProjecting;
  const effectiveTarget = lowerThirdActive && target === `display:${settings.lowerThird.displayId}` ? "lowerThird" : target;
  const [draft, setDraft] = useState(() => selectionFor(settings, effectiveTarget));
  const [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [libraryLoading, setLibraryLoading] = useState(true), [libraryError, setLibraryError] = useState("");
  const [search, setSearch] = useState(""), [filter, setFilter] = useState("all");
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
    const refresh = () => {
      const revision = ++libraryRevision.current;
      void window.dualcast.listBackgroundMedia().then(value => { if (active && revision === libraryRevision.current) { setItems(value); setLibraryError(""); } })
        .catch(error => { if (active && revision === libraryRevision.current) setLibraryError(String(error)); }).finally(() => { if (active) setLibraryLoading(false); });
    };
    refresh();
    window.addEventListener("focus", refresh);
    return () => { active = false; window.removeEventListener("focus", refresh); };
  }, []);
  useEffect(() => {
    if (!choseTarget.current && displays.length) {
      choseTarget.current = true;
      setTarget(`display:${(displays.find(display => !display.isPrimary) ?? displays[0]).id}`);
    }
  }, [displays]);
  const savedSelection = JSON.stringify(selectionFor(settings, effectiveTarget));
  useEffect(() => { setDraft(JSON.parse(savedSelection)); }, [effectiveTarget, savedSelection]);
  useEffect(() => setPreviewError(false), [draft.url, draft.kind]);
  const backgrounds = normalizeDisplayBackgrounds(settings.displayBackgrounds);
  const mediaName = (selection: BackgroundSelection) => selection.kind === "none" ? "Solid color" : items.find(asset => asset.id === selection.assetId || asset.url === selection.url)?.name ?? `Existing ${selection.kind}`;
  const lowerThirdScreen = displays.findIndex(display => display.id === settings.lowerThird.displayId);
  const targets = [
    ...displays.map((display, index) => {
      const band = lowerThirdActive && settings.lowerThird.displayId === display.id;
      const open = band ? isLowerThirdProjecting : isProjecting && projectionTargetIds.includes(display.id);
      return { id: `display:${display.id}`, name: `Screen ${index + 1} · ${display.name}`, badge: String(index + 1),
        detail: `${display.size.width} × ${display.size.height}${display.isPrimary ? " · Primary / operator screen" : ""}`,
        status: `${band ? "Lower-third output" : "Sanctuary output"} · ${open ? "Open" : "Not open"}`,
        assignment: band ? mediaName(selectionFor(settings, "lowerThird")) : modeForDisplay(settings.sanctuaryDisplay, backgrounds, display.id) === "program" ? "Mirrors Program" : backgrounds.displays[display.id] ? mediaName(selectionFor(settings, `display:${display.id}`)) : backgrounds.sanctuary ? `Shared: ${mediaName(backgrounds.sanctuary)}` : "Shared sanctuary layout" };
    }),
    { id: "program", name: "Program / Preview", badge: "P", detail: "Recordings, streams, Virtual Camera & mirrored screens", status: "Behind scene sources", assignment: mediaName(selectionFor(settings, "program")) },
    { id: "sanctuary", name: "All sanctuary screens · shared default", badge: "All", detail: "Used by screens without their own background", status: "Individual screen choices stay in place", assignment: backgrounds.sanctuary ? mediaName(backgrounds.sanctuary) : "Existing sanctuary layout" },
    { id: "lowerThird", name: "Lower-third band", badge: "LT", detail: "Text band on Program and the lower-third screen", status: lowerThirdScreen >= 0 ? `Screen ${lowerThirdScreen + 1} · ${isLowerThirdProjecting ? "Open" : "Not open"}` : "No connected lower-third screen selected", assignment: mediaName(selectionFor(settings, "lowerThird")) },
    ...Array.from(new Set([...Object.keys(backgrounds.displays), ...(target.startsWith("display:") ? [target.slice(8)] : [])])).filter(id => !displays.some(display => display.id === id)).map(id => ({ id: `display:${id}`, name: `Disconnected screen ${id}`, badge: "—", detail: "Saved for reconnection", status: "Disconnected", assignment: mediaName(selectionFor(settings, `display:${id}`)) }))
  ];
  const selectedTarget = targets.find(item => item.id === target);
  const targetName = selectedTarget?.name ?? "Disconnected screen";
  const connectedTarget = displays.find(display => target === `display:${display.id}`);
  const sharedTargets = projectionTargetIds.filter(id => displays.some(display => display.id === id) && !(lowerThirdActive && id === settings.lowerThird.displayId));
  const canShow = effectiveTarget === "lowerThird" ? lowerThirdScreen >= 0 : target === "sanctuary" ? sharedTargets.length > 0 : Boolean(connectedTarget);
  const outputIsOpen = effectiveTarget === "lowerThird" ? isLowerThirdProjecting : target === "sanctuary" ? isProjecting && sharedTargets.length > 0 : isProjecting && projectionTargetIds.includes(target.slice(8));
  const edit = (update: Partial<BackgroundSelection>) => { setDraft(current => ({ ...current, ...update })); setMessage("Preview only. Apply when ready."); };
  const upload = async (kind: "image" | "video") => {
    setBusy(true); setMessage("");
    try {
      const result = await window.dualcast.importBackgroundMedia(kind);
      const added = result.items.filter(item => !items.some(existing => existing.id === item.id));
      libraryRevision.current++;
      setItems(result.items); setLibraryError("");
      if (added.length) {
        setSearch(""); setFilter("all");
        const first = added.find(item => !item.missing);
        if (first) setDraft(current => ({ ...current, kind: first.kind, assetId: first.id, url: first.url }));
      }
      setMessage([added.length ? `Uploaded ${added.length} ${added.length === 1 ? "file" : "files"}: ${added.map(item => item.name).join(", ")}. Saved in Your uploaded files. Select a file, then Apply.` : "No new files uploaded.", ...result.errors].join("\n"));
    } catch (error) { setMessage(`Upload failed: ${String(error)}`); }
    finally { setBusy(false); }
  };
  const remove = async (item: BackgroundMedia) => {
    setBusy(true);
    try {
      const result = await window.dualcast.deleteBackgroundMedia(item.id);
      if (!result.deleted) return;
      libraryRevision.current++;
      setItems(result.items);
      useAppStore.setState(state => ({ settings: { ...state.settings, displayBackgrounds: result.backgrounds } }));
      setDraft(current => current.assetId === item.id || current.url === item.url ? { ...current, kind: "none", assetId: "", url: "" } : current);
      let profileMessage = "";
      try {
        const profiles = parseStudioProfiles(localStorage.getItem(PROFILE_STORAGE_KEY));
        if (profiles.length) localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify(profiles.map(profile => ({ ...profile, settings: { ...profile.settings, displayBackgrounds: withoutBackgroundMedia(profile.settings.displayBackgrounds, item) } }))));
      } catch { profileMessage = " Saved profiles could not be updated; this file will be unavailable in those profiles."; }
      setMessage(`Deleted ${item.name} from uploaded files. Backgrounds using it now use their base color.${profileMessage}`);
    } catch (error) { setMessage(`Could not delete ${item.name}: ${String(error)}`); }
    finally { setBusy(false); }
  };
  const apply = async (inherit = false, show = false) => {
    setBusy(true); setMessage("");
    let saved = false;
    try {
      const next: DisplayBackgrounds = normalizeDisplayBackgrounds(useAppStore.getState().settings.displayBackgrounds);
      const routing = explicitDisplayRouting(useAppStore.getState().settings.sanctuaryDisplay, useAppStore.getState().settings.displayBackgrounds);
      if (effectiveTarget.startsWith("display:")) { if (inherit) delete next.displays[effectiveTarget.slice(8)]; else next.displays[effectiveTarget.slice(8)] = { ...draft }; }
      else if (inherit) delete next[effectiveTarget as "program" | "sanctuary" | "lowerThird"];
      else next[effectiveTarget as "program" | "sanctuary" | "lowerThird"] = { ...draft };
      if (effectiveTarget.startsWith("display:")) {
        if (inherit) delete routing.displayModes![effectiveTarget.slice(8)]; else routing.displayModes![effectiveTarget.slice(8)] = "independent";
      } else if (effectiveTarget === "sanctuary" && !inherit) routing.mode = "independent";
      await updateSettings({ displayBackgrounds: next, ...(effectiveTarget === "sanctuary" || effectiveTarget.startsWith("display:") ? { sanctuaryDisplay: routing } : {}) }); saved = true;
      if (show) {
        const state = useAppStore.getState();
        if (effectiveTarget === "lowerThird") {
          if (!settings.lowerThird.displayId || !await window.dualcast.openLowerThird(settings.lowerThird.displayId)) throw Error("The lower-third screen could not be opened.");
          state.setIsLowerThirdProjecting(true);
          await updateSettings({ lowerThird: { ...state.settings.lowerThird, enabled: true } });
        } else {
          const currentTargets = state.projectionTargetIds.filter(id => displays.some(display => display.id === id));
          const ids = target === "sanctuary" ? sharedTargets : state.isProjecting ? Array.from(new Set([...currentTargets, target.slice(8)])) : [target.slice(8)];
          if (!await window.dualcast.openProjection(ids)) throw Error("The screen could not be opened.");
          state.setProjectionTargetIds(ids); state.setIsProjecting(true);
        }
      }
      setMessage(`${inherit ? "Shared / existing layout restored" : "Background applied"} for ${targetName}.${show ? " Output opened. Press Escape to close displays." : canShow && !outputIsOpen ? " Use Apply & show to open the output." : ""}`);
    } catch (error) { setMessage(`${saved ? "Background saved, but the output could not be updated" : "Background could not be saved"}: ${String(error)}`); }
    finally { setBusy(false); }
  };
  const identify = async () => {
    try { await window.dualcast.identifyProjectionDisplays(); setMessage("Screen numbers are shown on connected displays for 3 seconds."); }
    catch (error) { setMessage(`Could not identify screens: ${String(error)}`); }
  };
  const visibleItems = items.filter(item => (filter === "all" || item.kind === filter) && item.name.toLowerCase().includes(search.toLowerCase()));
  const selectedMedia = items.find(item => item.id === draft.assetId || item.url === draft.url);
  return <section className="compact-dock-panel backgrounds-panel" aria-label="Display backgrounds">
    <h3>Display backgrounds</h3>
    <p className="field-help">Choose where it goes, pick a file, then apply.</p>
    {message && <p role="status" className="background-status" style={{ whiteSpace: "pre-wrap" }}>{message}</p>}
    <fieldset disabled={busy} className="background-step"><legend>1. Choose a screen or output</legend>
    <button className="btn btn-outline" onClick={() => void identify()} disabled={!displays.length}>Identify screens · show numbers</button>
    {displayError && <p role="alert">Displays could not be loaded: {displayError}</p>}
    <div className="background-targets" role="group" aria-label="Background destination">
      {targets.map(item => <button key={item.id} className={`background-target ${target === item.id ? "selected" : ""}`} aria-pressed={target === item.id} data-background-target={item.id} onClick={() => { choseTarget.current = true; setTarget(item.id); setMessage(""); }}>
        <span className="background-screen-number" aria-hidden="true">{item.badge}</span>
        <span className="background-target-info"><strong>{item.name}</strong><small>{item.detail}</small><small>{item.status}</small><span>Current: {item.assignment}</span></span>
      </button>)}
    </div>
    {effectiveTarget === "program" ? <p className="field-help">Full-screen photos, videos and cameras in the scene cover this background.</p>
      : effectiveTarget === "lowerThird" ? <p className="field-help">Appears inside the text band when a lower-third slide is live. The rest of the dedicated output stays transparent.</p>
      : <p className="field-help">Apply switches the chosen screen to its independent text layout. Choose Mirror Program in display outputs to show Program again; saved backgrounds remain available.</p>}
    </fieldset>
    <fieldset disabled={busy} className="background-step"><legend>2. Choose a background</legend>
    <div className="background-upload-actions"><button onClick={() => void upload("image")}>Upload images</button><button onClick={() => void upload("video")}>Upload videos</button></div>
    <p className="field-help">Files are copied into OpenChurch on this computer and stay here for reuse.</p>
    <strong>Your uploaded files ({items.length})</strong>
    <div className="background-library-filters"><input aria-label="Search uploaded backgrounds" placeholder="Search your files…" value={search} onChange={event => setSearch(event.target.value)} /><select aria-label="Filter uploaded backgrounds" value={filter} onChange={event => setFilter(event.target.value)}><option value="all">All files</option><option value="image">Images</option><option value="video">Videos</option></select></div>
    {libraryLoading && <p className="field-help">Loading uploaded files…</p>}
    {libraryError && <p role="alert">Your library could not be loaded. Reopen this panel to retry. {libraryError}</p>}
    <div className="background-library" role="group" aria-label="Choose background media">
      <button className={`background-media-choice ${draft.kind === "none" ? "selected" : ""}`} aria-pressed={draft.kind === "none"} onClick={() => edit({ kind: "none", assetId: "", url: "" })}>None · solid color</button>
      {visibleItems.map(item => <div key={item.id} className="background-library-item"><button disabled={item.missing} className={`background-media-choice ${draft.assetId === item.id && draft.kind !== "none" ? "selected" : ""}`} aria-pressed={draft.assetId === item.id && draft.kind !== "none"} onClick={() => edit({ kind: item.kind, assetId: item.id, url: item.url })}>
        <span className="background-thumbnail" aria-hidden="true">{!item.missing && (item.kind === "image" ? <img src={item.url} alt="" loading="lazy" /> : <video src={item.url} muted playsInline preload="metadata" />)}{item.kind === "video" && <span className="background-video-badge">▶</span>}</span><span>{item.name}<small>{item.missing ? "File unavailable · upload again" : item.kind === "video" ? "Uploaded · Video · silent loop" : "Uploaded · Image"}</small></span>
      </button><button className="background-media-delete" aria-label={`Delete ${item.name}`} onClick={() => void remove(item)}>Delete</button></div>)}
    </div>
    {!libraryLoading && !libraryError && !items.length && <p className="field-help">No uploaded files yet. Upload images or videos above to see them here.</p>}
    {items.length > 0 && !visibleItems.length && <p className="field-help">No files match. Change the search or choose All files.</p>}
    </fieldset>
    <fieldset disabled={busy} className="background-step"><legend>3. Preview & apply</legend>
    <p className="background-selection-summary"><strong>{targetName}</strong><span>{mediaName(draft)} · Preview only until applied</span></p>
    <div ref={previewRef} className="background-draft-preview" style={{ backgroundColor: draft.color }}><BackgroundLayer background={draft} frozen={!previewVisible} onError={() => setPreviewError(true)} /></div>
    {(previewError || selectedMedia?.missing) && <p role="alert">This file cannot be loaded. Upload it again or choose another file. For video, use MP4 (H.264) or WebM.</p>}
    <details><summary>Color, fit & opacity</summary>
    <div className="field-grid">
      <label className="field">Base color<input aria-label="Background base color" type="color" value={draft.color} onChange={event => edit({ color: event.target.value })} /></label>
      <label className="field">Fit<select aria-label="Background fit" value={draft.fit} onChange={event => edit({ fit: event.target.value as "cover" | "contain" })}><option value="cover">Fill / crop edges</option><option value="contain">Fit whole image / video</option></select></label>
    </div>
    <label className="field">Media opacity ({Math.round(draft.opacity * 100)}%)<input aria-label="Background media opacity" type="range" min={0} max={1} step={0.05} value={draft.opacity} onChange={event => edit({ opacity: Number(event.target.value) })} /></label>
    </details>
    <button className="btn btn-primary" disabled={previewError || Boolean(selectedMedia?.missing)} onClick={() => void apply()}>{busy ? "Working…" : "Apply background"}</button>
    {canShow && <button className="btn btn-primary" disabled={previewError || Boolean(selectedMedia?.missing)} onClick={() => void apply(false, true)}>Apply & show{connectedTarget ? ` on Screen ${displays.indexOf(connectedTarget) + 1}` : effectiveTarget === "lowerThird" ? " on lower-third screen" : " on selected sanctuary screens"}</button>}
    {connectedTarget?.isPrimary && <p className="field-help">Showing on the primary screen covers the studio. Press Escape to return.</p>}
    <button className="btn btn-outline" onClick={() => void apply(true)}>{effectiveTarget.startsWith("display:") ? "Use shared sanctuary layout" : "Restore existing layout"}</button>
    {onOpenDisplays && <button onClick={onOpenDisplays}>Manage display outputs…</button>}
    </fieldset>
  </section>;
};
export default BackgroundsPanel;

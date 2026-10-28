import React, { useEffect, useRef, useState } from "react";
import type { LowerThirdAnimation, LowerThirdSettings, LowerThirdSlide } from "../../shared/types";
import { lowerThirdDesignPresets, lowerThirdTitle, normalizeLowerThirdDesign, type LowerThirdDesign, type LowerThirdTextStyle } from "../../shared/lowerThirdDesign";
import { drawDesignerLowerThird } from "../utils/designerLowerThird";
import { useAppStore } from "../store/useAppStore";
import { sanitizeScriptureText } from "../../shared/scriptureText";
import "./LowerThirdDesigner.css";

export const lowerThirdAnimationOptions: Array<{ value: LowerThirdAnimation; label: string }> = [
  { value: "none", label: "None" }, { value: "fade", label: "Fade" }, { value: "reveal", label: "Layered reveal" },
  { value: "spring", label: "Soft spring" }, { value: "slide-left", label: "Slide left" }, { value: "slide-right", label: "Slide right" },
  { value: "slide-up", label: "Slide up" }, { value: "slide-down", label: "Slide down" }, { value: "zoom", label: "Zoom" }, { value: "wipe", label: "Wipe" }
];
const fonts = ["Segoe UI", "Arial", "Georgia", "Times New Roman", "Trebuchet MS", "Verdana"];
const newId = () => crypto.randomUUID();

const DesignPreview: React.FC<{ config: LowerThirdSettings; slide: LowerThirdSlide; small?: boolean; replay?: number }> = ({ config, slide, small, replay }) => {
  const canvas = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    let disposed = false, frame = 0;
    const image = config.imageUrl ? new Image() : null;
    let start = 0;
    const draw = (now = performance.now()) => {
      if (disposed || !canvas.current) return;
      const ctx = canvas.current.getContext("2d"); if (!ctx) return;
      const width = 960, height = 540;
      ctx.clearRect(0, 0, width, height); ctx.save();
      if (small) ctx.translate(0, -350);
      const bg = ctx.createLinearGradient(0, 0, width, height); bg.addColorStop(0, "#16283b"); bg.addColorStop(.55, "#25364d"); bg.addColorStop(1, "#101822"); ctx.fillStyle = bg; ctx.fillRect(0, 0, width, height);
      ctx.fillStyle = "#ffffff08"; ctx.beginPath(); ctx.moveTo(0, height); ctx.lineTo(width * .65, 0); ctx.lineTo(width, 0); ctx.lineTo(width, height); ctx.fill();
      const progress = replay && !small ? Math.min(1, (now - start) / config.animationDurationMs) : 1;
      drawDesignerLowerThird(ctx, width, height, small ? { ...config, position: "bottom", heightPercent: 28 } : config, slide, image?.complete && image.naturalWidth ? image : null, progress < 1 ? config.entranceAnimation : "none", "enter", progress);
      ctx.restore();
      if (progress < 1) frame = requestAnimationFrame(draw);
    };
    start = performance.now(); draw(start);
    if (image) { image.onload = () => draw(); image.src = config.imageUrl; }
    return () => { disposed = true; cancelAnimationFrame(frame); if (image) image.onload = null; };
  }, [config, slide, small, replay]);
  return <canvas ref={canvas} width={960} height={small ? 190 : 540} className={small ? "design-thumbnail" : "designer-preview"} aria-label={small ? "Lower-third style preview" : "Title and content design preview"} />;
};

const TextStyleEditor: React.FC<{ label: string; value: LowerThirdTextStyle; change: (value: LowerThirdTextStyle) => void }> = ({ label, value, change }) => {
  const set = (patch: Partial<LowerThirdTextStyle>) => change({ ...value, ...patch });
  return <details className="designer-options"><summary>{label} styling</summary><div className="designer-control-grid">
    <label>Text color<input aria-label={`${label} text color`} type="color" value={value.color} onChange={e => set({ color: e.target.value })} /></label>
    <label>Panel color<input aria-label={`${label} panel color`} type="color" value={value.background} onChange={e => set({ background: e.target.value })} /></label>
    <label>Font<input aria-label={`${label} font`} list={`designer-${label}-fonts`} value={value.fontFamily} onChange={e => set({ fontFamily: e.target.value })} /><datalist id={`designer-${label}-fonts`}>{fonts.map(font => <option key={font} value={font} />)}</datalist></label>
    <label>Weight<select aria-label={`${label} font weight`} value={value.weight ?? (value.bold ? 700 : 400)} onChange={e => set({ weight: Number(e.target.value), bold: Number(e.target.value) >= 600 })}>{[[400,"Regular"],[500,"Medium"],[600,"Semibold"],[700,"Bold"],[800,"Extra bold"],[900,"Black"]].map(([weight,name]) => <option key={weight} value={weight}>{name}</option>)}</select></label>
    <label>Size<input aria-label={`${label} font size`} type="number" min={16} max={120} value={value.fontSize} onChange={e => set({ fontSize: Number(e.target.value) })} /></label>
    <label>Alignment<select aria-label={`${label} alignment`} value={value.align} onChange={e => set({ align: e.target.value as LowerThirdTextStyle["align"] })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
    <label>Letter spacing<input aria-label={`${label} letter spacing`} type="number" min={0} max={8} step={.5} value={value.letterSpacing} onChange={e => set({ letterSpacing: Number(e.target.value) })} /></label>
    <label className="designer-wide">Panel opacity · {Math.round(value.opacity * 100)}%<input aria-label={`${label} panel opacity`} type="range" min={0} max={1} step={.01} value={value.opacity} onChange={e => set({ opacity: Number(e.target.value) })} /></label>
  </div><div className="feature-toggle-list">{(["bold", "italic", "underline"] as const).map(key => <label className="feature-toggle" key={key}><input aria-label={`${label} ${key}`} type="checkbox" checked={value[key]} onChange={e => set({ [key]: e.target.checked, ...(key === "bold" ? { weight: e.target.checked ? 800 : 400 } : {}) })} />{key[0].toUpperCase() + key.slice(1)}</label>)}</div><span className="field-help">Choose a font or type any installed font name. Styling applies to every title or content line, including song titles and Scripture references.</span></details>;
};

const LowerThirdDesigner: React.FC = () => {
  const config = useAppStore(state => state.settings.lowerThird);
  const design = normalizeLowerThirdDesign(config.design);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [liveTyping, setLiveTyping] = useState(false);
  const [replay, setReplay] = useState(0);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const published = useRef("");
  const active = config.slides.find(slide => slide.id === config.activeSlideId);
  const save = (patch: Partial<LowerThirdSettings>) => useAppStore.getState().updateSettings({ lowerThird: { ...useAppStore.getState().settings.lowerThird, ...patch } }).catch(error => setMessage(String(error)));
  const saveDesign = (patch: Partial<LowerThirdDesign>) => void save({ design: { ...normalizeLowerThirdDesign(useAppStore.getState().settings.lowerThird.design), ...patch } });
  const load = (slide?: LowerThirdSlide) => {
    if (!slide) return;
    setEditingId(slide.id); setTitle(lowerThirdTitle(slide)); setContent(slide.text); setLiveTyping(false); setMessage("Loaded for editing. Cue Preview or Update live when ready.");
  };
  const commit = async (live: boolean) => {
    if (!content.trim()) return;
    const state = useAppStore.getState(), current = state.settings.lowerThird;
    const original = current.slides.find(slide => slide.id === editingId);
    // Preview edits of a live card receive their own ID. Explicit live edits keep
    // the current ID so the graphics cue updates without replaying its entrance.
    const id = original && (live || original.id !== current.programSlideId) ? original.id : newId();
    if (!current.slides.some(item => item.id === id) && current.slides.length >= 500) { setMessage("Remove unused slides before adding another card (500-slide limit)."); return; }
    const clean = (value: string) => original?.kind === "scripture" ? sanitizeScriptureText(value) : value;
    const slide: LowerThirdSlide = { ...original, id, title: clean(title.trim()), text: clean(content.trim()), kind: original?.kind ?? "text", deckId: original?.deckId ?? id, deckTitle: original?.kind && original.kind !== "text" ? original.deckTitle : title.trim() || "Designer card" };
    const slides = current.slides.some(item => item.id === id) ? current.slides.map(item => item.id === id ? slide : item) : [...current.slides, slide];
    setEditingId(id); setBusy(true);
    if (live) published.current = JSON.stringify([id, title, content]);
    try { await state.stageLowerThird(slides, id, live); setMessage(live ? "Title and content are live." : "Card cued in Preview. Program is unchanged."); }
    catch (error) { setLiveTyping(false); setMessage(String(error)); }
    finally { setBusy(false); }
  };
  useEffect(() => {
    if (!liveTyping || busy || !editingId || editingId !== config.programSlideId || !content.trim() || published.current === JSON.stringify([editingId, title, content])) return;
    const timer = window.setTimeout(() => void commit(true), 180);
    return () => window.clearTimeout(timer);
  }, [title, content, liveTyping, editingId, config.programSlideId, busy]);
  const sample: LowerThirdSlide = { id: "design-preview", title: content || title || editingId ? title : active ? lowerThirdTitle(active) : "WELCOME TO OPENCHURCH", text: content || active?.text || "A place to belong. A message of hope." };
  return <div className="lower-third-designer">
    <div className="designer-preset-grid" role="group" aria-label="Designer lower-third styles">{lowerThirdDesignPresets.map(preset => <button type="button" key={preset.id} aria-pressed={design.preset === preset.id} className={`designer-preset ${design.preset === preset.id ? "selected" : ""}`} onClick={() => { void save({ design: structuredClone(preset.design), entranceAnimation: "reveal", exitAnimation: "reveal" }); setReplay(value => value + 1); }}>
      <DesignPreview small config={{ ...config, design: preset.design }} slide={{ id: "preset", title: "OPENCHURCH", text: preset.id === "worship" ? "Great is Your faithfulness" : "A message of hope" }} /><strong>{preset.name}</strong><span>{preset.description}</span>
    </button>)}</div>
    <DesignPreview config={config} slide={sample} replay={replay} />
    <div className="designer-preview-label"><span>Design preview · shared lower-third logo</span><button type="button" className="btn btn-outline btn-compact" onClick={() => setReplay(value => value + 1)}>Replay entrance</button></div>
    <label className="field">Title<input aria-label="Designer title" value={title} maxLength={500} onChange={e => setTitle(e.target.value)} placeholder="Name, song title, reference or announcement" /></label>
    <label className="field">Content / description<textarea aria-label="Designer content" value={content} maxLength={100000} onChange={e => setContent(e.target.value)} placeholder="Description, lyrics or message" /></label>
    <div className="designer-button-grid"><button type="button" className="btn btn-outline" disabled={busy || !active} onClick={() => load(active)}>Load selected slide</button><button type="button" className="btn btn-outline" disabled={busy} onClick={() => { setEditingId(null); setTitle(""); setContent(""); setLiveTyping(false); }}>New card</button><button type="button" className="btn btn-outline" disabled={busy || !content.trim()} onClick={() => void commit(false)}>Cue in Preview</button><button type="button" className="btn btn-primary" disabled={busy || !content.trim()} onClick={() => void commit(true)}>{editingId && editingId === config.programSlideId ? "Update live" : "Show card live"}</button></div>
    <label className="feature-toggle designer-live-toggle"><input type="checkbox" checked={liveTyping} disabled={busy || !editingId || editingId !== config.programSlideId} onChange={e => setLiveTyping(e.target.checked)} />Update live while typing</label>
    <span className="field-help">Live typing edits only the loaded live card. Cue in Preview keeps Program intact. Song titles and Scripture references appear in the title panel; each slide supplies the content. Style changes apply immediately.</span>
    <TextStyleEditor label="Title" value={design.title} change={value => saveDesign({ title: value })} />
    <TextStyleEditor label="Content" value={design.content} change={value => saveDesign({ content: value })} />
    <details className="designer-options"><summary>Shape, layout and logo</summary><div className="designer-control-grid">
      <label>Composition<select aria-label="Designer composition" value={design.layout ?? "stacked"} onChange={e => saveDesign({ layout: e.target.value as LowerThirdDesign["layout"] })}><option value="stacked">Floating title</option><option value="split">Split title & content</option><option value="rail">Accent rail</option><option value="outlined">Double frame</option></select></label>
      <label>Shape<select aria-label="Designer shape" value={design.shape} onChange={e => saveDesign({ shape: e.target.value as LowerThirdDesign["shape"] })}><option value="rounded">Rounded</option><option value="slant">Angled ribbon</option><option value="cut-corner">Cut corners</option><option value="capsule">Capsule</option><option value="rectangle">Rectangle</option></select></label>
      <label>Placement<select aria-label="Designer placement" value={design.side} onChange={e => saveDesign({ side: e.target.value as LowerThirdDesign["side"] })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></label>
      <label>Accent<input aria-label="Designer accent color" type="color" value={design.accent} onChange={e => saveDesign({ accent: e.target.value })} /></label>
      <label>Gradient end<input aria-label="Designer gradient end" type="color" value={design.gradientEnd} onChange={e => saveDesign({ gradientEnd: e.target.value })} /></label>
      <label>Width (%)<input aria-label="Designer width" type="number" min={40} max={96} value={design.widthPercent} onChange={e => saveDesign({ widthPercent: Number(e.target.value) })} /></label>
      <label>Edge inset (%)<input aria-label="Designer edge inset" type="number" min={0} max={15} value={design.insetPercent} onChange={e => saveDesign({ insetPercent: Number(e.target.value) })} /></label>
      <label>Title height (%)<input aria-label="Designer title height" type="number" min={20} max={45} value={design.titleHeightPercent} onChange={e => saveDesign({ titleHeightPercent: Number(e.target.value) })} /></label>
      <label>Band height (%)<input aria-label="Designer band height" type="number" min={10} max={50} value={config.heightPercent} onChange={e => void save({ heightPercent: Number(e.target.value) })} /></label>
      <label>Vertical position<select aria-label="Designer vertical position" value={config.position} onChange={e => void save({ position: e.target.value as "top" | "bottom" })}><option value="bottom">Bottom</option><option value="top">Top</option></select></label>
      <label>Logo side<select aria-label="Designer logo side" value={design.logoPosition} onChange={e => saveDesign({ logoPosition: e.target.value as "left" | "right" })}><option value="left">Left</option><option value="right">Right</option></select></label>
      <label>Logo frame<select aria-label="Designer logo frame" value={design.logoShape} onChange={e => saveDesign({ logoShape: e.target.value as LowerThirdDesign["logoShape"] })}><option value="circle">Circle</option><option value="rounded">Rounded</option><option value="square">Square</option></select></label>
      <label>Logo scale<input aria-label="Designer logo scale" type="range" min={.5} max={1.3} step={.05} value={design.logoScale} onChange={e => saveDesign({ logoScale: Number(e.target.value) })} /></label>
      <label>Border<input aria-label="Designer border width" type="range" min={0} max={6} step={.5} value={design.borderWidth} onChange={e => saveDesign({ borderWidth: Number(e.target.value) })} /></label>
      <label>Shadow<input aria-label="Designer shadow" type="range" min={0} max={50} value={design.shadow} onChange={e => saveDesign({ shadow: Number(e.target.value) })} /></label>
    </div><span className="field-help">Change the shared logo in Formatting and Animation → Standard Lower-Third Logo. Text sizes use a 1920 px reference and fit to the panel.</span></details>
    <details className="designer-options"><summary>Entrance and exit</summary><div className="designer-control-grid">{(["entranceAnimation", "exitAnimation"] as const).map(key => <label key={key}>{key === "entranceAnimation" ? "Entrance" : "Exit"}<select aria-label={`Designer ${key === "entranceAnimation" ? "entrance" : "exit"}`} value={config[key]} onChange={e => void save({ [key]: e.target.value as LowerThirdAnimation })}>{lowerThirdAnimationOptions.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}<label>Duration (ms)<input aria-label="Designer animation duration" type="number" min={100} max={3000} step={50} value={config.animationDurationMs} onChange={e => void save({ animationDurationMs: Number(e.target.value) })} /></label><label className="feature-toggle"><input type="checkbox" checked={config.showOnProgram} onChange={e => void save({ showOnProgram: e.target.checked })} />Show over Program</label></div></details>
    {message && <p role="status" className="field-help">{message}</p>}
  </div>;
};
export default LowerThirdDesigner;

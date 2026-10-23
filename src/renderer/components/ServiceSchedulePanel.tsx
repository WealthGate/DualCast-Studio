import React, { useEffect, useRef, useState } from "react";
import { useShallow } from "zustand/react/shallow";
import { useAppStore } from "../store/useAppStore";
import type { ServiceSchedule, ServiceScheduleItem } from "../../shared/types";
import { adjacentScheduleCue, normalizeServiceSchedules } from "../../shared/serviceSchedules";
import { playScheduleItem } from "../utils/playScheduleItem";
import { sanitizeScriptureText } from "../../shared/scriptureText";

const id = () => crypto.randomUUID();
let session: { scheduleId: string; selected: string; live: { id: string; slide: number } | null } = { scheduleId: "", selected: "", live: null };
const ServiceSchedulePanel: React.FC = () => {
  const { scenes, sources, lowerThird } = useAppStore(useShallow(state => ({ scenes: state.scenes, sources: state.sources, lowerThird: state.settings.lowerThird })));
  const [library, setLibrary] = useState(() => normalizeServiceSchedules(useAppStore.getState().settings.serviceSchedules));
  const latest = useRef(library), saving = useRef(false), revision = useRef(0);
  const [scheduleId, setScheduleId] = useState(library.some(item => item.id === session.scheduleId) ? session.scheduleId : library[0]?.id ?? "");
  const [selected, setSelected] = useState(session.selected);
  const [live, setLive] = useState<{ id: string; slide: number } | null>(session.live);
  const [deleted, setDeleted] = useState<ServiceSchedule | null>(null);
  useEffect(() => { session = { scheduleId, selected, live }; }, [scheduleId, selected, live]);
  const [status, setStatus] = useState("Schedules are saved on this PC.");
  const [busy, setBusy] = useState(false);
  const [kind, setKind] = useState("scene"), [target, setTarget] = useState(""), [content, setContent] = useState("");
  const schedule = library.find(item => item.id === scheduleId);
  const selectedItem = schedule?.items.find(item => item.id === selected);
  const decks = Array.from(new Map(lowerThird.slides.map(slide => [slide.deckId || slide.id, { key: slide.deckId || slide.id, name: slide.deckTitle || slide.reference || slide.text.slice(0, 60) }])).values());
  const save = async (next: ServiceSchedule[]) => {
    latest.current = next; setLibrary(next); revision.current++;
    if (saving.current) return;
    saving.current = true; setStatus("Saving…");
    try {
      let savedRevision;
      do {
        savedRevision = revision.current;
        const result = await window.dualcast.updateSettings({ serviceSchedules: latest.current });
        useAppStore.setState({ settings: { ...useAppStore.getState().settings, serviceSchedules: result.serviceSchedules ?? latest.current } });
      } while (savedRevision !== revision.current);
      setStatus("Saved on this PC.");
    } catch (error) { setStatus(`Not saved: ${error instanceof Error ? error.message : String(error)}. Use Save now to retry.`); }
    finally { saving.current = false; }
  };
  const change = (next: ServiceSchedule) => { void save(latest.current.map(item => item.id === next.id ? next : item)); };
  const newSchedule = () => {
    const next: ServiceSchedule = { id: id(), name: "New service", date: "", items: [] };
    void save([...latest.current, next]); setScheduleId(next.id); setSelected(""); setLive(null);
  };
  const add = async () => {
    if (!schedule || busy) return;
    if (schedule.items.length >= 500) { setStatus("A schedule can contain up to 500 items."); return; }
    setBusy(true);
    try {
      const base = { id: id(), title: "", notes: "", minutes: 0 };
      let item: ServiceScheduleItem;
      if (kind === "scene") {
        const scene = scenes.find(scene => scene.id === (target || scenes[0]?.id));
        if (!scene) throw Error("Create a scene first, or choose another item type.");
        item = { ...base, title: scene.name, kind: "scene", scene: structuredClone(scene), sources: structuredClone(Object.fromEntries(scene.sourceIds.filter(id => sources[id]).map(id => [id, sources[id]]))) };
      } else if (kind === "deck") {
        const key = target || decks[0]?.key;
        const slides = lowerThird.slides.filter(slide => (slide.deckId || slide.id) === key);
        if (!slides.length) throw Error("Prepare song or Scripture slides in Lower Third Studio first.");
        item = { ...base, title: decks.find(deck => deck.key === key)?.name || "Presentation", kind: "slides", slides: structuredClone(slides) };
      } else if (kind === "scripture") {
        if (!content.trim()) throw Error("Enter a Scripture reference.");
        const source = useAppStore.getState().settings.scriptureSourceId || "online";
        const result = source === "online" ? await window.dualcast.fetchScripture({ reference: content.trim() })
          : await window.dualcast.lookupScriptureLibrary({ libraryId: source, reference: content.trim() });
        const verses = result.verses?.length ? result.verses : [{ text: result.text, reference: result.reference }];
        item = { ...base, title: result.reference, kind: "slides", slides: verses.map(verse => ({ id: id(), kind: "scripture", text: sanitizeScriptureText(verse.text), reference: verse.reference })) };
      } else if (kind === "note") {
        if (!content.trim()) throw Error("Enter an operator note.");
        item = { ...base, title: content.trim().split("\n")[0].slice(0, 120), notes: content.trim(), kind: "note" };
      } else {
        if (!content.trim()) throw Error("Enter the text to display.");
        item = { ...base, title: content.trim().split("\n")[0].slice(0, 120), kind: "slides", slides: [{ id: id(), text: content.trim(), kind: "text" }] };
      }
      // Keep the latest edits if Scripture lookup was slow or the service changed.
      const current = latest.current.find(candidate => candidate.id === schedule.id);
      if (!current) return;
      const next = { ...current, items: [...current.items, item] };
      await save(latest.current.map(candidate => candidate.id === current.id ? next : candidate));
      setSelected(item.id); setContent("");
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const run = async (index: number, slide = 0) => {
    const item = schedule?.items[index];
    if (!schedule || !item || busy) return;
    setBusy(true);
    try {
      await playScheduleItem(schedule.id, item, slide);
      setSelected(item.id); setLive({ id: item.id, slide });
      setStatus(item.kind === "note" ? "Operator note selected. The live output continues unchanged." : `Showing ${item.title}${item.kind === "slides" ? ` · slide ${slide + 1}/${item.slides.length}` : ""}`);
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)); }
    finally { setBusy(false); }
  };
  const move = (direction: -1 | 1) => {
    if (!schedule) return;
    const cue = adjacentScheduleCue(schedule.items, schedule.items.findIndex(item => item.id === live?.id), live?.slide ?? 0, direction);
    if (cue) void run(cue.index, cue.slide);
  };
  const reorder = (index: number, direction: number) => {
    if (!schedule || index + direction < 0 || index + direction >= schedule.items.length) return;
    const items = [...schedule.items]; [items[index], items[index + direction]] = [items[index + direction], items[index]];
    change({ ...schedule, items });
  };
  return <section className="service-schedule-panel" aria-label="Service schedule">
    <p className="field-help">Prepare your service in order. Selecting or editing an item does not change the live output. Use Show live or the live navigation buttons.</p>
    <div className="schedule-actions">
      <label className="field">Saved service<select aria-label="Saved service" value={scheduleId} disabled={busy} onChange={event => { setScheduleId(event.target.value); setSelected(""); setLive(null); }}><option value="">Choose a service…</option>{library.map(item => <option key={item.id} value={item.id}>{item.name}{item.date ? ` · ${item.date}` : ""}</option>)}</select></label>
      <button className="btn btn-outline" onClick={newSchedule} disabled={busy || library.length >= 100}>New service</button>
    </div>
    {schedule && <>
      <div className="field"><label>Service name<input aria-label="Service name" maxLength={200} value={schedule.name} onChange={event => change({ ...schedule, name: event.target.value })} /></label></div>
      <div className="field"><label>Service date<input aria-label="Service date" type="date" value={schedule.date} onChange={event => change({ ...schedule, date: event.target.value })} /></label></div>
      <div className="schedule-actions"><button className="btn btn-outline" onClick={() => void save(latest.current)}>Save now</button><button className="btn btn-outline" disabled={busy || library.length >= 100} onClick={() => { const copy = structuredClone(schedule); copy.id = id(); copy.name += " (copy)"; void save([...latest.current, copy]); setScheduleId(copy.id); setSelected(""); setLive(null); }}>Duplicate service</button><button className="btn btn-outline" disabled={busy} onClick={() => { setDeleted(schedule); void save(latest.current.filter(item => item.id !== schedule.id)); setScheduleId(""); setSelected(""); setLive(null); }}>Delete service</button></div>
      <strong>{schedule.items.length} items · {schedule.items.reduce((total, item) => total + item.minutes, 0)} planned minutes</strong>
      <ol className="schedule-items">{schedule.items.map((item, index) => <li key={item.id} className={`${selected === item.id ? "selected" : ""} ${live?.id === item.id ? "current" : ""}`}>
        <button className="schedule-item-select" aria-pressed={selected === item.id} onClick={() => setSelected(item.id)}><strong>{item.title}</strong><small>{item.kind === "slides" ? `${item.slides.length} slide${item.slides.length === 1 ? "" : "s"}` : item.kind === "scene" ? "Scene snapshot" : "Operator note"}{item.minutes ? ` · ${item.minutes} min` : ""}{live?.id === item.id ? " · Current" : ""}</small></button>
        <div className="schedule-item-actions"><button aria-label={`Move ${item.title} up`} disabled={index === 0 || busy} onClick={() => reorder(index, -1)}>↑</button><button aria-label={`Move ${item.title} down`} disabled={index === schedule.items.length - 1 || busy} onClick={() => reorder(index, 1)}>↓</button><button aria-label={`Remove ${item.title}`} disabled={busy} onClick={() => { change({ ...schedule, items: schedule.items.filter(candidate => candidate.id !== item.id) }); if (selected === item.id) setSelected(""); }}>Remove</button></div>
      </li>)}</ol>
      {!schedule.items.length && <p className="field-help">Add scenes, songs, Scripture, announcements or operator notes below.</p>}
      {selectedItem && <div className="schedule-item-editor field"><label>Item title<input aria-label="Item title" value={selectedItem.title} onChange={event => change({ ...schedule, items: schedule.items.map(item => item.id === selected ? { ...item, title: event.target.value } : item) })} /></label><label>Planned minutes<input aria-label="Planned minutes" type="number" min={0} max={600} value={selectedItem.minutes} onChange={event => change({ ...schedule, items: schedule.items.map(item => item.id === selected ? { ...item, minutes: Math.max(0, Math.min(600, Number(event.target.value) || 0)) } : item) })} /></label><label>Operator notes<textarea aria-label="Operator notes" rows={2} value={selectedItem.notes} onChange={event => change({ ...schedule, items: schedule.items.map(item => item.id === selected ? { ...item, notes: event.target.value } : item) })} /></label></div>}
      <div className="schedule-actions schedule-live-actions"><button className="btn btn-outline" disabled={busy || !live || (schedule.items[0]?.id === live.id && live.slide === 0)} onClick={() => move(-1)}>Previous · Live</button><button className="btn btn-primary" disabled={busy || !selectedItem} onClick={() => void run(schedule.items.findIndex(item => item.id === selected))}>{selectedItem?.kind === "note" ? "Select note" : "Show live"}</button><button className="btn btn-primary" disabled={busy || !adjacentScheduleCue(schedule.items, schedule.items.findIndex(item => item.id === live?.id), live?.slide ?? 0, 1)} onClick={() => move(1)}>Next · Live</button></div>
      <fieldset className="schedule-add field"><legend>Add service item</legend><label>Item type<select aria-label="Schedule item type" value={kind} onChange={event => { setKind(event.target.value); setTarget(""); setContent(""); }}><option value="scene">Scene / media</option><option value="deck">Prepared song / slide deck</option><option value="scripture">Scripture reference</option><option value="text">Announcement / text</option><option value="note">Operator note</option></select></label>
        {kind === "scene" || kind === "deck" ? <label>{kind === "scene" ? "Scene" : "Prepared deck"}<select aria-label="Schedule item content" value={target || (kind === "scene" ? scenes[0]?.id : decks[0]?.key) || ""} onChange={event => setTarget(event.target.value)}>{kind === "scene" ? scenes.map(scene => <option key={scene.id} value={scene.id}>{scene.name}</option>) : decks.map(deck => <option key={deck.key} value={deck.key}>{deck.name}</option>)}</select></label> : <label>{kind === "scripture" ? "Scripture reference" : "Content"}<textarea aria-label="Schedule item content" rows={3} placeholder={kind === "scripture" ? "John 3:16–18" : "Enter text…"} value={content} onChange={event => setContent(event.target.value)} /></label>}
        <button className="btn btn-outline" disabled={busy} onClick={() => void add()}>{busy ? "Working…" : "Add to schedule"}</button>
      </fieldset>
      <p className="field-help">Saved scenes and slides are copied into this schedule. Media files must remain available on this PC. Planned minutes are for the rundown; items advance only when you choose.</p>
    </>}
    <p role="status" className="field-help">{status}</p>
    {deleted && <button className="btn btn-outline" onClick={() => { void save([...latest.current, deleted]); setScheduleId(deleted.id); setDeleted(null); }}>Undo deleting {deleted.name}</button>}
  </section>;
};
export default ServiceSchedulePanel;

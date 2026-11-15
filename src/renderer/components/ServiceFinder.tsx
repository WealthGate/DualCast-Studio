import React, { useEffect, useMemo, useRef, useState } from "react";
import type { LowerThirdSlide, SongLibraryEntry } from "../../shared/types";
import { sanitizeScriptureText } from "../../shared/scriptureText";
import { createScriptureSlides, splitTextIntoSlides } from "../utils/presentationSlides";
import { playScheduleItem } from "../utils/playScheduleItem";
import { useAppStore } from "../store/useAppStore";
import "./serviceFinder.css";

type Entry = {
  id: string;
  title: string;
  category: string;
  panel: string;
  notes?: string;
  operatorOnly?: boolean;
  slides?: LowerThirdSlide[];
  open: (index: number, live: boolean) => void | Promise<void>;
};

const shortcuts = [
  ["schedule", "Schedule"], ["scripture", "Scripture"], ["lower-third", "Lyrics & slides"],
  ["scenes", "Scenes"], ["audio", "Audio Mixer"], ["system", "Settings"]
] as const;

const categoryFor = (slide?: LowerThirdSlide) => slide?.kind === "scripture" ? "Scripture" : slide?.kind === "song" ? "Lyrics" : "Presentation";
const panelFor = (slide?: LowerThirdSlide) => slide?.kind === "scripture" ? "scripture" : "lower-third";
const slideText = (slide: LowerThirdSlide) => {
  const content = [slide.title, slide.reference, slide.text].filter(Boolean).join(" ");
  return slide.kind === "scripture" ? sanitizeScriptureText(content) : content;
};
const scriptureReference = /^(?:[1-3]\s*)?\p{L}[\p{L}\s.]+\s+\d+(?::\d+(?:\s*[-–]\s*\d+)?)?$/u;

const playFinderDeck = (id: string, title: string, slides: LowerThirdSlide[], index: number, live: boolean) =>
  playScheduleItem("finder", { kind: "slides", id, title, slides, notes: "", minutes: 0 }, index, live);

const ServiceFinder: React.FC<{ onClose: () => void; onOpenDock: (panel: string, showPreview?: boolean) => void }> = ({ onClose, onOpenDock }) => {
  const dialog = useRef<HTMLDialogElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const isOpen = useRef(false);
  const actionRunning = useRef(false);
  const [query, setQuery] = useState("");
  const [songs, setSongs] = useState<SongLibraryEntry[]>([]);
  const [songError, setSongError] = useState(false);
  const [choices, setChoices] = useState<Record<string, number>>({});
  const [failure, setFailure] = useState("");
  const [busy, setBusy] = useState(false);
  const schedules = useAppStore(state => state.settings.serviceSchedules);
  const activeScheduleId = useAppStore(state => state.activeScheduleId);
  const queuedSlides = useAppStore(state => state.settings.lowerThird.slides);
  const scenes = useAppStore(state => state.scenes);

  useEffect(() => {
    const element = dialog.current!;
    isOpen.current = true;
    element.showModal();
    search.current?.focus();
    void window.dualcast.listSongs().then(result => { if (isOpen.current) setSongs(result); }, () => {
      if (isOpen.current) setSongError(true);
    });
    return () => { isOpen.current = false; element.close(); };
  }, []);

  const entries = useMemo(() => {
    const results: Entry[] = [];
    const services = [...(schedules ?? [])].sort((a, b) => Number(b.id === activeScheduleId) - Number(a.id === activeScheduleId));
    for (const service of services) {
      for (const item of service.items) {
        if (item.kind === "note") {
          results.push({ id: `schedule:${service.id}:${item.id}`, title: item.title, category: `${service.name} · Operator note`,
            notes: item.notes, operatorOnly: true, panel: "schedule", open: () => useAppStore.setState({ activeScheduleId: service.id }) });
          continue;
        }
        const slides = item.kind === "slides" ? item.slides : undefined;
        results.push({
          id: `schedule:${service.id}:${item.id}`, title: item.title, category: `${service.name} · ${item.kind === "scene" ? "Scene" : categoryFor(slides?.[0])}`,
          slides, panel: item.kind === "scene" ? "scenes" : panelFor(slides?.[0]),
          open: (index, live) => playScheduleItem(service.id, item, index, live)
        });
      }
    }
    const decks = new Map<string, LowerThirdSlide[]>();
    for (const slide of queuedSlides) {
      if (slide.id.startsWith("service:")) continue;
      const key = slide.deckId ?? slide.id;
      if (!decks.has(key)) decks.set(key, []);
      decks.get(key)!.push(slide);
    }
    decks.forEach((slides, key) => {
      const first = slides[0];
      results.push({
        id: `deck:${key}`, title: first.deckTitle || first.title || first.reference || first.text.slice(0, 76),
        category: categoryFor(first), slides, panel: panelFor(first),
        open: (index, live) => {
          const current = useAppStore.getState();
          const id = slides[index].id;
          if (!current.settings.lowerThird.slides.some(slide => slide.id === id)) throw Error("This slide has been removed.");
          return current.stageLowerThird(current.settings.lowerThird.slides, id, live);
        }
      });
    });
    for (const song of songs) {
      const slides = splitTextIntoSlides(song.lyrics, { linesPerSlide: 4 }).map<LowerThirdSlide>((text, index) => ({
        id: `${song.id}:${index}`, kind: "song", text
      }));
      if (!slides.length) continue;
      results.push({ id: `song:${song.id}`, title: song.title, category: "Song library", panel: "lower-third", slides,
        open: (index, live) => playFinderDeck(song.id, song.title, slides, index, live) });
    }
    for (const scene of scenes) {
      if (scene.id.startsWith("service:") || scene.enabled === false) continue;
      results.push({ id: `scene:${scene.id}`, title: scene.name, category: "Scene", panel: "scenes", open: (_index, live) => {
        const state = useAppStore.getState();
        state.selectPreviewScene(scene.id);
        if (live) state.setProgramScene(scene.id, { preserveProgramText: true });
      } });
    }
    return results;
  }, [activeScheduleId, queuedSlides, scenes, schedules, songs]);

  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  const matches = entries.flatMap(entry => {
    const heading = `${entry.title} ${entry.category} ${entry.notes ?? ""}`.toLocaleLowerCase();
    const matchesAll = (content: string) => words.every(word => content.includes(word));
    if (matchesAll(heading)) return [{ entry, firstMatch: 0 }];
    const firstMatch = entry.slides?.findIndex(slide => matchesAll(`${heading} ${slideText(slide).toLocaleLowerCase()}`)) ?? -1;
    return firstMatch >= 0 ? [{ entry, firstMatch }] : [];
  });
  const canLookUp = scriptureReference.test(query.trim());

  const run = async (load: () => void | Promise<void>, panel: string, showPreview = false) => {
    if (actionRunning.current) return;
    actionRunning.current = true;
    setBusy(true);
    setFailure("");
    try {
      await load();
      if (!isOpen.current) return;
      onOpenDock(panel, showPreview);
      onClose();
    } catch (error) {
      if (isOpen.current) setFailure(error instanceof Error ? error.message : "This item could not be opened.");
    } finally {
      actionRunning.current = false;
      if (isOpen.current) setBusy(false);
    }
  };

  const lookUp = () => run(async () => {
    const current = useAppStore.getState();
    const source = current.settings.scriptureSourceId;
    const reference = query.trim().replace(/\s*[-–]\s*/g, "-");
    const result = source && source !== "online"
      ? await window.dualcast.lookupScriptureLibrary({ libraryId: source, reference })
      : await window.dualcast.fetchScripture({ reference });
    if (!isOpen.current || useAppStore.getState().presentationGeneration !== current.presentationGeneration) return;
    const id = crypto.randomUUID();
    const title = sanitizeScriptureText(result.reference);
    const slides = createScriptureSlides(result, { mode: "verse", linesPerSlide: 2, deckId: id, deckTitle: title, createId: () => crypto.randomUUID() });
    if (!slides.length) throw Error("No Scripture text was returned for this passage.");
    await playFinderDeck(id, title, slides, 0, false);
    useAppStore.setState({ scriptureCueRequest: { ...result, reference: title, text: sanitizeScriptureText(result.text), requestId: id, live: false } });
  }, "scripture", true);

  return (
    <dialog ref={dialog} className="service-finder" aria-labelledby="service-finder-title" onCancel={event => { event.preventDefault(); onClose(); }}>
      <header>
        <h2 id="service-finder-title">Find service content</h2>
        <button type="button" className="btn btn-outline" aria-label="Close service finder" onClick={onClose}>Close</button>
      </header>
      <form onSubmit={event => {
        event.preventDefault();
        if (busy || !query.trim()) return;
        if (matches.length === 1) {
          const { entry, firstMatch } = matches[0];
          void run(() => entry.open(choices[entry.id] ?? firstMatch, false), entry.panel, !entry.operatorOnly);
        } else if (canLookUp) void lookUp();
      }}>
        <input ref={search} type="search" readOnly={busy} aria-label="Search service content" placeholder="Scripture reference, sermon, lyrics or scene"
          value={query} onChange={event => { setQuery(event.target.value); setChoices({}); setFailure(""); }} />
      </form>
      <nav aria-label="Open a workspace panel">
        {shortcuts.map(([id, label]) => <button key={id} type="button" className="btn btn-outline" onClick={() => { onOpenDock(id); onClose(); }}>{label}</button>)}
      </nav>
      {canLookUp ? <button type="button" className="btn btn-outline finder-lookup" onClick={() => void lookUp()} disabled={busy}>Look up {query.trim()} in Preview</button> : null}
      {busy || failure || songError ? <p role={failure ? "alert" : "status"}>{failure || (busy ? "Opening content…" : "The local song library could not be loaded.")}</p> : null}
      <div className="finder-results" aria-label="Service content results">
        {matches.length === 0 ? <p>{query.trim() ? "No prepared items match this search." : "Add content to your schedule or import songs to find them here."}</p> : null}
        {matches.slice(0, 24).map(({ entry, firstMatch }) => {
          const index = choices[entry.id] ?? firstMatch;
          const selected = entry.slides?.[index];
          return <article key={entry.id} className="finder-result">
            <div><strong>{entry.title}</strong><small>{entry.category}</small></div>
            {entry.slides && entry.slides.length > 1 ? <select value={index} aria-label={`Slide in ${entry.title}`} onChange={event => setChoices({ ...choices, [entry.id]: Number(event.target.value) })}>
              {entry.slides.map((slide, i) => <option value={i} key={`${slide.id}:${i}`}>{i + 1}. {slideText(slide).replace(/\s+/g, " ").slice(0, 80)}</option>)}
            </select> : selected ? <p>{slideText(selected).slice(0, 140)}</p> : null}
            {entry.operatorOnly ? <details><summary>Read operator note</summary><p className="finder-note">{entry.notes || "This note has no text."}</p></details> : null}
            <div className="finder-actions">
              {entry.operatorOnly ? <button type="button" className="btn btn-outline" disabled={busy}
                onClick={() => void run(() => entry.open(0, false), entry.panel)}>Open schedule</button> : <>
              <button type="button" className="btn btn-primary" disabled={busy} onClick={() => void run(() => entry.open(index, false), entry.panel, true)}>Cue in Preview</button>
              <button type="button" className="btn btn-outline" disabled={busy} onClick={() => void run(() => entry.open(index, true), entry.panel)}>Show live</button>
              </>}
            </div>
          </article>;
        })}
        {matches.length > 24 ? <p>Showing 24 of {matches.length}. Keep typing to narrow the search.</p> : null}
      </div>
    </dialog>
  );
};

export default ServiceFinder;

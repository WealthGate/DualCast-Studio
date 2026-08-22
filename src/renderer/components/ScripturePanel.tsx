import React, { useEffect, useMemo, useState } from "react";
import { LowerThirdAnimation, ScriptureFetchResult, ScriptureLibraryCatalog, ScriptureLibrarySummary, Source, SourceRect } from "../../shared/types";
import { useAppStore } from "../store/useAppStore";
import { maximumBibleVerseNumber, standardBibleBooks } from "../utils/bibleBooks";
import { createScriptureSlides } from "../utils/presentationSlides";

const createId = () => crypto.randomUUID?.() ?? `scripture-${Date.now()}`;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type ScriptureSceneLayout =
  | "full"
  | "half-video-left"
  | "half-video-right"
  | "quarter-video-left"
  | "quarter-video-right"
  | "custom";

const animationOptions: Array<{ value: LowerThirdAnimation; label: string }> = [
  { value: "none", label: "None" },
  { value: "fade", label: "Fade" },
  { value: "slide-left", label: "Slide Left" },
  { value: "slide-right", label: "Slide Right" },
  { value: "slide-up", label: "Slide Up" },
  { value: "zoom", label: "Zoom" },
  { value: "wipe", label: "Wipe" }
];

const toRgba = (hex: string, opacity: number) => {
  const match = hex.match(/^#([0-9a-f]{6})$/i);
  if (!match) return hex;
  const value = Number.parseInt(match[1], 16);
  return `rgba(${(value >> 16) & 255}, ${(value >> 8) & 255}, ${value & 255}, ${clamp(opacity, 0, 1)})`;
};

const isVisualSource = (source: Source) => source.type !== "audio" && source.type !== "text";

const ScripturePanel: React.FC = () => {
  const {
    settings,
    scenes,
    sources,
    previewSceneId,
    updateSettings,
    stageLowerThird,
    addPresentationSourceToScene,
    updateSourceRect,
    persistStudioState
  } = useAppStore();
  const [reference, setReference] = useState("John 3:16");
  const [verseText, setVerseText] = useState("");
  const [resolvedReference, setResolvedReference] = useState("");
  const [translation, setTranslation] = useState<string | undefined>();
  const [loadedVerses, setLoadedVerses] = useState<ScriptureFetchResult["verses"]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [libraries, setLibraries] = useState<ScriptureLibrarySummary[]>([]);
  const [scriptureSource, setScriptureSource] = useState("online");
  const [catalog, setCatalog] = useState<ScriptureLibraryCatalog | null>(null);
  const [selectedBook, setSelectedBook] = useState("John");
  const [selectedChapter, setSelectedChapter] = useState(3);
  const [startVerse, setStartVerse] = useState(16);
  const [endVerse, setEndVerse] = useState(16);
  const [splitMode, setSplitMode] = useState<"passage" | "verse" | "lines">("verse");
  const [linesPerSlide, setLinesPerSlide] = useState(2);
  const [libraryUrl, setLibraryUrl] = useState("");
  const [sceneLayout, setSceneLayout] = useState<ScriptureSceneLayout>("full");
  const [customRect, setCustomRect] = useState<SourceRect>({ x: 10, y: 10, width: 80, height: 80 });

  const activeScene = useMemo(
    () => scenes.find((scene) => scene.id === previewSceneId) ?? null,
    [previewSceneId, scenes]
  );

  const refreshLibraries = async () => {
    try {
      const next = await window.dualcast.listScriptureLibraries();
      setLibraries(next);
      if (scriptureSource !== "online" && !next.some((library) => library.id === scriptureSource)) {
        setScriptureSource("online");
      }
    } catch {
      setLibraries([]);
    }
  };

  useEffect(() => {
    void refreshLibraries();
  }, []);

  useEffect(() => {
    let active = true;
    if (scriptureSource === "online") {
      setCatalog(null);
      return () => { active = false; };
    }
    window.dualcast.getScriptureLibraryCatalog(scriptureSource)
      .then((next) => {
        if (!active) return;
        setCatalog(next);
        const firstBook = next.books[0];
        if (firstBook && !next.books.some((book) => book.name === selectedBook)) {
          setSelectedBook(firstBook.name);
          setSelectedChapter(firstBook.chapters[0]?.number ?? 1);
          setStartVerse(firstBook.chapters[0]?.verses[0] ?? 1);
          setEndVerse(firstBook.chapters[0]?.verses[0] ?? 1);
        }
      })
      .catch(() => active && setCatalog(null));
    return () => { active = false; };
  }, [scriptureSource]);

  const navigatorBooks = useMemo(() => catalog
    ? catalog.books.map((book) => ({ name: book.name, chapterCount: book.chapters.length, chapters: book.chapters }))
    : standardBibleBooks.map(([name, chapterCount]) => ({ name, chapterCount, chapters: undefined })), [catalog]);
  const selectedBookInfo = navigatorBooks.find((book) => book.name === selectedBook) ?? navigatorBooks[0];
  const chapterOptions = selectedBookInfo?.chapters?.map((chapter) => chapter.number)
    ?? Array.from({ length: selectedBookInfo?.chapterCount ?? 1 }, (_, index) => index + 1);
  const selectedChapterInfo = selectedBookInfo?.chapters?.find((chapter) => chapter.number === selectedChapter);
  const verseOptions = selectedChapterInfo?.verses?.length
    ? selectedChapterInfo.verses
    : Array.from({ length: maximumBibleVerseNumber }, (_, index) => index + 1);
  const navigatorReference = `${selectedBook} ${selectedChapter}:${startVerse}${endVerse > startVerse ? `-${endVerse}` : ""}`;

  useEffect(() => {
    if (!chapterOptions.includes(selectedChapter)) setSelectedChapter(chapterOptions[0] ?? 1);
  }, [selectedBook, catalog]);

  useEffect(() => {
    const firstVerse = verseOptions[0] ?? 1;
    if (!verseOptions.includes(startVerse)) setStartVerse(firstVerse);
    if (!verseOptions.includes(endVerse) || endVerse < startVerse) setEndVerse(startVerse);
  }, [selectedBook, selectedChapter, catalog, startVerse]);

  const fetchVerse = async (requestedReference = reference) => {
    const query = requestedReference.trim();
    if (!query) return;
    setLoading(true);
    setMessage(null);
    try {
      const result = scriptureSource === "online"
        ? await window.dualcast.fetchScripture({ reference: query })
        : await window.dualcast.lookupScriptureLibrary({ libraryId: scriptureSource, reference: query });
      setReference(query);
      setVerseText(result.text);
      setResolvedReference(result.reference);
      setTranslation(result.translation);
      setLoadedVerses(result.verses ?? []);
      setMessage(scriptureSource === "online"
        ? result.translation ? `Loaded ${result.translation} from the configured online provider.` : "Complete passage loaded from the configured online provider."
        : result.translation ? `Loaded ${result.translation} from the offline library.` : "Complete passage loaded from the offline library.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load Scripture.");
    } finally {
      setLoading(false);
    }
  };

  const sendToLowerThird = async () => {
    const text = verseText.trim();
    if (!text) return;
    const displayReference = resolvedReference.trim() || reference.trim();
    const deckId = createId();
    const slides = createScriptureSlides({
      reference: displayReference,
      text,
      translation,
      verses: loadedVerses
    }, {
      mode: splitMode,
      linesPerSlide,
      deckId,
      deckTitle: `${displayReference}${translation ? ` - ${translation}` : ""}`,
      createId
    });
    if (!slides.length) return;
    await stageLowerThird([...settings.lowerThird.slides, ...slides], slides[0].id);
    setMessage(`${slides.length} Scripture slide${slides.length === 1 ? "" : "s"} staged in Preview. Press TAKE or Take Text Live after checking the layout.`);
  };

  const sceneRects = () => {
    if (sceneLayout === "custom") {
      const x = clamp(customRect.x, 0, 95);
      const y = clamp(customRect.y, 0, 95);
      return {
        text: {
          x,
          y,
          width: clamp(customRect.width, 5, 100 - x),
          height: clamp(customRect.height, 5, 100 - y)
        },
        video: null
      };
    }
    if (sceneLayout === "full") return { text: { x: 0, y: 0, width: 100, height: 100 }, video: null };
    const videoOnLeft = sceneLayout.endsWith("left");
    const videoWidth = sceneLayout.startsWith("half") ? 50 : 25;
    const textWidth = 100 - videoWidth;
    return {
      text: { x: videoOnLeft ? videoWidth : 0, y: 0, width: textWidth, height: 100 },
      video: { x: videoOnLeft ? 0 : textWidth, y: 0, width: videoWidth, height: 100 }
    };
  };

  const addToPreviewScene = async () => {
    const text = verseText.trim();
    if (!text || !activeScene) return;
    if (activeScene.locked) {
      setMessage("Unlock the Preview scene before adding Scripture text.");
      return;
    }
    const rects = sceneRects();
    const displayReference = resolvedReference.trim() || reference.trim();
    await addPresentationSourceToScene(activeScene.id, {
      type: "text",
      name: `Scripture - ${displayReference || "Passage"}`,
      rect: rects.text,
      enabled: true,
      audioEnabled: false,
      volume: 1,
      data: {
        text: `${displayReference}\n${text}`,
        fontSize: Math.max(28, settings.lowerThird.fontSize),
        color: settings.lowerThird.textColor,
        backgroundColor: toRgba(settings.lowerThird.backgroundColor, settings.lowerThird.backgroundOpacity),
        align: settings.lowerThird.textAlign,
        role: "presentation"
      }
    });
    if (rects.video) {
      const visual = activeScene.sourceIds
        .map((id) => sources[id])
        .filter((source): source is Source => Boolean(source))
        .filter((source) => isVisualSource(source) && !source.locked)
        .at(-1);
      if (visual) updateSourceRect(visual.id, rects.video);
    }
    await persistStudioState();
    setMessage(settings.lowerThird.allowMultipleTextLayers
      ? "Scripture added to Preview alongside the existing text layers. Check it, then press TAKE."
      : "Scripture added to Preview and the previous managed lyrics/Scripture were removed. Check it, then press TAKE.");
  };

  const savePassageOffline = async () => {
    if (!verseText.trim()) return;
    setLoading(true);
    try {
      await window.dualcast.saveScripturePassage({
        reference: resolvedReference.trim() || reference.trim(),
        text: verseText.trim(),
        translation
      });
      await refreshLibraries();
      setMessage("Passage saved to the offline Saved Passages library.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save the passage offline.");
    } finally {
      setLoading(false);
    }
  };

  const importLibrary = async () => {
    setLoading(true);
    try {
      const library = await window.dualcast.importScriptureLibrary();
      if (library) {
        await refreshLibraries();
        setScriptureSource(library.id);
        setMessage(`Imported ${library.name} with ${library.passageCount.toLocaleString()} passages.`);
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to import the Scripture library.");
    } finally {
      setLoading(false);
    }
  };

  const downloadLibrary = async () => {
    if (!libraryUrl.trim()) return;
    setLoading(true);
    try {
      const library = await window.dualcast.downloadScriptureLibrary({ url: libraryUrl.trim() });
      await refreshLibraries();
      setScriptureSource(library.id);
      setLibraryUrl("");
      setMessage(`Downloaded ${library.name} with ${library.passageCount.toLocaleString()} passages for offline use.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to download the Scripture library.");
    } finally {
      setLoading(false);
    }
  };

  const removeSelectedLibrary = async () => {
    const selected = libraries.find((library) => library.id === scriptureSource);
    if (!selected || selected.savedPassages) return;
    setLoading(true);
    try {
      await window.dualcast.removeScriptureLibrary({ libraryId: selected.id });
      setScriptureSource("online");
      await refreshLibraries();
      setMessage(`Removed ${selected.name} from this computer.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to remove the Scripture library.");
    } finally {
      setLoading(false);
    }
  };

  const selectedLibrary = libraries.find((library) => library.id === scriptureSource);

  return (
    <section className="panel scripture-panel">
      <div className="panel-header"><h2>Scripture</h2><span className="tag">Online + Offline</span></div>
      <div className="field">
        <label htmlFor="scriptureSource">Scripture Source</label>
        <select id="scriptureSource" value={scriptureSource} onChange={(event) => setScriptureSource(event.target.value)}>
          <option value="online">Configured Online Provider</option>
          {libraries.map((library) => (
            <option key={library.id} value={library.id}>{library.name}{library.translation ? ` - ${library.translation}` : ""} ({library.passageCount})</option>
          ))}
        </select>
        {selectedLibrary ? <span className="field-help">Stored offline on this computer. {selectedLibrary.passageCount.toLocaleString()} passages.</span> : null}
      </div>
      <div
        className="scripture-reference-picker"
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            void fetchVerse(navigatorReference);
          }
        }}
      >
        <div className="field-grid scripture-reference-grid">
          <label className="field">
            <span>Book</span>
            <select aria-label="Bible book" value={selectedBook} onChange={(event) => setSelectedBook(event.target.value)}>
              {navigatorBooks.map((book) => <option key={book.name} value={book.name}>{book.name}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Chapter</span>
            <select aria-label="Bible chapter" value={selectedChapter} onChange={(event) => setSelectedChapter(Number(event.target.value))}>
              {chapterOptions.map((chapter) => <option key={chapter} value={chapter}>{chapter}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Start verse</span>
            <select aria-label="Start verse" value={startVerse} onChange={(event) => {
              const value = Number(event.target.value);
              setStartVerse(value);
              if (endVerse < value) setEndVerse(value);
            }}>
              {verseOptions.map((verse) => <option key={verse} value={verse}>{verse}</option>)}
            </select>
          </label>
          <label className="field">
            <span>End verse</span>
            <select aria-label="End verse" value={endVerse} onChange={(event) => setEndVerse(Number(event.target.value))}>
              {verseOptions.filter((verse) => verse >= startVerse).map((verse) => <option key={verse} value={verse}>{verse}</option>)}
            </select>
          </label>
        </div>
        <button className="btn btn-primary" onClick={() => void fetchVerse(navigatorReference)} disabled={loading}>
          {loading ? "Working..." : `Load ${navigatorReference}`}
        </button>
        <span className="field-help">Choose the book, chapter and verse, then press Enter or click Load.</span>
      </div>
      <details className="scripture-direct-reference">
        <summary>Type a reference instead</summary>
        <div className="field-row">
          <input id="scriptureReference" value={reference} onChange={(event) => setReference(event.target.value)} onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              void fetchVerse(reference);
            }
          }} placeholder="John 3:16-18" />
          <button className="btn btn-outline" onClick={() => void fetchVerse(reference)} disabled={loading || !reference.trim()}>Load Reference</button>
        </div>
      </details>
      <div className="field"><label htmlFor="resolvedReference">Displayed Reference</label><input id="resolvedReference" value={resolvedReference} onChange={(event) => setResolvedReference(event.target.value)} placeholder="Reference appears with the verse" /></div>
      <div className="field"><label htmlFor="scriptureText">Verse Text</label><textarea id="scriptureText" className="scripture-text" value={verseText} onChange={(event) => setVerseText(event.target.value)} placeholder="Fetched, offline, or manually pasted licensed Scripture text appears here." /></div>
      <div className="field">
        <label htmlFor="scriptureLines">Lower-Third Line Limit</label>
        <input id="scriptureLines" type="number" min={0} max={20} value={settings.lowerThird.maxLines} onChange={(event) => updateSettings({ lowerThird: { ...settings.lowerThird, maxLines: Number(event.target.value) } })} />
        <span className="field-help">0 shows the complete selected passage and reference.</span>
      </div>
      <div className="presentation-safety-card">
        <strong>Scripture Slide Arrangement</strong>
        <div className="field-grid">
          <label className="field">
            <span>Split passage</span>
            <select value={splitMode} onChange={(event) => setSplitMode(event.target.value as typeof splitMode)}>
              <option value="verse">One verse per slide</option>
              <option value="lines">Automatic lines per slide</option>
              <option value="passage">Entire passage on one slide</option>
            </select>
          </label>
          {splitMode === "lines" ? (
            <label className="field">
              <span>Lines per slide</span>
              <select value={linesPerSlide} onChange={(event) => setLinesPerSlide(Number(event.target.value))}>
                {[1, 2, 3, 4, 5, 6].map((value) => <option key={value} value={value}>{value}</option>)}
              </select>
            </label>
          ) : null}
          <label className="field">
            <span>Verse entrance</span>
            <select value={settings.lowerThird.entranceAnimation} onChange={(event) => updateSettings({ lowerThird: { ...settings.lowerThird, entranceAnimation: event.target.value as LowerThirdAnimation } })}>
              {animationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Transition speed (ms)</span>
            <input type="number" min={100} max={3000} step={50} value={settings.lowerThird.animationDurationMs} onChange={(event) => updateSettings({ lowerThird: { ...settings.lowerThird, animationDurationMs: Number(event.target.value) } })} />
          </label>
        </div>
        <span className="field-help">Scripture uses the same lower-third formatting, Bible image, background and animated transitions as songs.</span>
      </div>
      <div className="scripture-action-grid">
        <button className="btn btn-primary" onClick={sendToLowerThird} disabled={!verseText.trim()}>Create Slides in Preview</button>
        <button className="btn btn-outline" onClick={savePassageOffline} disabled={loading || !verseText.trim()}>Save Passage Offline</button>
      </div>

      <details className="scripture-scene-layout" open>
        <summary>Add Scripture to Preview Scene</summary>
        <div className="field">
          <label htmlFor="scriptureSceneLayout">Text Layout</label>
          <select id="scriptureSceneLayout" value={sceneLayout} onChange={(event) => setSceneLayout(event.target.value as ScriptureSceneLayout)}>
            <option value="full">Full Screen Text</option>
            <option value="half-video-left">Half Screen - Video Left</option>
            <option value="half-video-right">Half Screen - Video Right</option>
            <option value="quarter-video-left">Text 3/4 - Video Left</option>
            <option value="quarter-video-right">Text 3/4 - Video Right</option>
            <option value="custom">Custom / Freely Resizable</option>
          </select>
        </div>
        {sceneLayout === "custom" ? (
          <div className="field-grid scripture-custom-rect">
            {(["x", "y", "width", "height"] as const).map((field) => (
              <label key={field} className="field">
                <span>{field.toUpperCase()} (%)</span>
                <input type="number" min={field === "width" || field === "height" ? 5 : 0} max={100} value={customRect[field]} onChange={(event) => setCustomRect((current) => ({ ...current, [field]: clamp(Number(event.target.value), field === "width" || field === "height" ? 5 : 0, 100) }))} />
              </label>
            ))}
          </div>
        ) : null}
        <button className="btn btn-primary" onClick={addToPreviewScene} disabled={!verseText.trim() || !activeScene}>Add to Preview Scene</button>
        <span className="field-help">The text remains private in Preview until TAKE. Custom text can be dragged and resized like any other source.</span>
      </details>

      <details className="scripture-library-manager">
        <summary>Offline Scripture Libraries</summary>
        <div className="field">
          <label htmlFor="scriptureLibraryUrl">HTTPS Library JSON Address</label>
          <input id="scriptureLibraryUrl" type="url" value={libraryUrl} onChange={(event) => setLibraryUrl(event.target.value)} placeholder="https://example.org/licensed-bible.json" />
          <button className="btn btn-outline" onClick={downloadLibrary} disabled={loading || !libraryUrl.trim()}>Download Library</button>
        </div>
        <div className="field-row">
          <button className="btn btn-outline" onClick={importLibrary} disabled={loading}>Import Downloaded JSON</button>
          {selectedLibrary && !selectedLibrary.savedPassages ? <button className="btn btn-danger" onClick={removeSelectedLibrary} disabled={loading}>Remove Selected Library</button> : null}
        </div>
        <span className="field-help">Compatible JSON may contain passages or verses with reference/text fields, or books with chapters and verses. Maximum size: 25 MB. Use only translations and libraries you are licensed to download and display.</span>
      </details>
      {message ? <p className="panel-note">{message}</p> : null}
    </section>
  );
};

export default ScripturePanel;

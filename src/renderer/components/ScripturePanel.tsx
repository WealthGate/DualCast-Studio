import React, { useEffect, useMemo, useState } from "react";
import { LowerThirdSlide, ScriptureLibrarySummary, Source, SourceRect } from "../../shared/types";
import { useAppStore } from "../store/useAppStore";

const createId = () => crypto.randomUUID?.() ?? `scripture-${Date.now()}`;
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

type ScriptureSceneLayout =
  | "full"
  | "half-video-left"
  | "half-video-right"
  | "quarter-video-left"
  | "quarter-video-right"
  | "custom";

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
    addSourceToScene,
    updateSourceRect,
    persistStudioState
  } = useAppStore();
  const [reference, setReference] = useState("John 3:16");
  const [verseText, setVerseText] = useState("");
  const [resolvedReference, setResolvedReference] = useState("");
  const [translation, setTranslation] = useState<string | undefined>();
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [libraries, setLibraries] = useState<ScriptureLibrarySummary[]>([]);
  const [scriptureSource, setScriptureSource] = useState("online");
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

  const fetchVerse = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const result = scriptureSource === "online"
        ? await window.dualcast.fetchScripture({ reference })
        : await window.dualcast.lookupScriptureLibrary({ libraryId: scriptureSource, reference });
      setVerseText(result.text);
      setResolvedReference(result.reference);
      setTranslation(result.translation);
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
    const slide: LowerThirdSlide = { id: createId(), text, reference: resolvedReference.trim() || reference.trim(), kind: "scripture" };
    await updateSettings({ lowerThird: { ...settings.lowerThird, slides: [...settings.lowerThird.slides, slide], activeSlideId: slide.id } });
    setMessage("Scripture sent to the lower third with Bible-specific branding.");
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
    addSourceToScene(activeScene.id, {
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
        role: "standard"
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
    setMessage("Scripture added to the Preview scene. Check it, resize if needed, then press TAKE.");
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
      <div className="field">
        <label htmlFor="scriptureReference">Book, Chapter and Verse</label>
        <div className="field-row">
          <input id="scriptureReference" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="John 3:16-18" />
          <button className="btn btn-primary" onClick={fetchVerse} disabled={loading || !reference.trim()}>{loading ? "Working..." : scriptureSource === "online" ? "Fetch Online" : "Load Offline"}</button>
        </div>
      </div>
      <div className="field"><label htmlFor="resolvedReference">Displayed Reference</label><input id="resolvedReference" value={resolvedReference} onChange={(event) => setResolvedReference(event.target.value)} placeholder="Reference appears with the verse" /></div>
      <div className="field"><label htmlFor="scriptureText">Verse Text</label><textarea id="scriptureText" className="scripture-text" value={verseText} onChange={(event) => setVerseText(event.target.value)} placeholder="Fetched, offline, or manually pasted licensed Scripture text appears here." /></div>
      <div className="field">
        <label htmlFor="scriptureLines">Lower-Third Line Limit</label>
        <input id="scriptureLines" type="number" min={0} max={20} value={settings.lowerThird.maxLines} onChange={(event) => updateSettings({ lowerThird: { ...settings.lowerThird, maxLines: Number(event.target.value) } })} />
        <span className="field-help">0 shows the complete selected passage and reference.</span>
      </div>
      <div className="scripture-action-grid">
        <button className="btn btn-primary" onClick={sendToLowerThird} disabled={!verseText.trim()}>Send to Lower Third</button>
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

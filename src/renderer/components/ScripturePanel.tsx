import React, { useState } from "react";
import { LowerThirdSlide } from "../../shared/types";
import { useAppStore } from "../store/useAppStore";

const createId = () => crypto.randomUUID?.() ?? `scripture-${Date.now()}`;

const ScripturePanel: React.FC = () => {
  const { settings, updateSettings } = useAppStore();
  const [reference, setReference] = useState("John 3:16");
  const [verseText, setVerseText] = useState("");
  const [resolvedReference, setResolvedReference] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchVerse = async () => {
    setLoading(true);
    setMessage(null);
    try {
      const result = await window.dualcast.fetchScripture({ reference });
      setVerseText(result.text);
      setResolvedReference(result.reference);
      setMessage(result.translation ? `Loaded ${result.translation}.` : "Complete passage loaded.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to fetch Scripture.");
    } finally {
      setLoading(false);
    }
  };

  const sendToLowerThird = async () => {
    const text = verseText.trim();
    if (!text) return;
    const slide: LowerThirdSlide = { id: createId(), text, reference: resolvedReference.trim() || reference.trim(), kind: "scripture" };
    await updateSettings({ lowerThird: { ...settings.lowerThird, slides: [...settings.lowerThird.slides, slide], activeSlideId: slide.id } });
    setMessage("Scripture sent to the lower third.");
  };

  return (
    <section className="panel scripture-panel">
      <div className="panel-header"><h2>Scripture</h2><span className="tag">Complete Verse</span></div>
      <div className="field">
        <label htmlFor="scriptureReference">Book, Chapter and Verse</label>
        <div className="field-row">
          <input id="scriptureReference" value={reference} onChange={(event) => setReference(event.target.value)} placeholder="John 3:16-18" />
          <button className="btn btn-primary" onClick={fetchVerse} disabled={loading || !reference.trim()}>{loading ? "Loading..." : "Fetch"}</button>
        </div>
      </div>
      <div className="field"><label htmlFor="resolvedReference">Displayed Reference</label><input id="resolvedReference" value={resolvedReference} onChange={(event) => setResolvedReference(event.target.value)} placeholder="Reference appears with the verse" /></div>
      <div className="field"><label htmlFor="scriptureText">Verse Text</label><textarea id="scriptureText" className="scripture-text" value={verseText} onChange={(event) => setVerseText(event.target.value)} placeholder="Fetched text appears here, or paste a licensed translation manually." /></div>
      <div className="field">
        <label htmlFor="scriptureLines">Display Line Limit</label>
        <input id="scriptureLines" type="number" min={0} max={20} value={settings.lowerThird.maxLines} onChange={(event) => updateSettings({ lowerThird: { ...settings.lowerThird, maxLines: Number(event.target.value) } })} />
        <span className="field-help">0 shows the complete selected passage and reference.</span>
      </div>
      <button className="btn btn-primary" onClick={sendToLowerThird} disabled={!verseText.trim()}>Send to Lower Third</button>
      {message ? <p className="panel-note">{message}</p> : null}
    </section>
  );
};

export default ScripturePanel;

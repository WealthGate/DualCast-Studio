import React, { useEffect, useMemo, useRef, useState } from "react";
import { LowerThirdAnimation, LowerThirdSlide, SongLibraryEntry } from "../../shared/types";
import { useAppStore } from "../store/useAppStore";
import { insertSlideAfter, replaceSlideWithLines, splitSlideLines } from "../utils/lowerThirdSlides";
import { splitTextIntoSlides } from "../utils/presentationSlides";

const createId = () => crypto.randomUUID?.() ?? `lower-third-${Date.now()}-${Math.random().toString(16).slice(2)}`;

const animationOptions: Array<{ value: LowerThirdAnimation; label: string }> = [
  { value: "none", label: "None" },
  { value: "fade", label: "Fade" },
  { value: "slide-left", label: "Slide Left" },
  { value: "slide-right", label: "Slide Right" },
  { value: "slide-up", label: "Slide Up" },
  { value: "zoom", label: "Zoom" },
  { value: "wipe", label: "Wipe" }
];

const LowerThirdPanel: React.FC = () => {
  const {
    settings,
    updateSettings,
    stageLowerThird,
    takeLowerThirdToProgram,
    clearProgramText
  } = useAppStore();
  const lowerThird = settings.lowerThird;
  const [manualText, setManualText] = useState("");
  const [bulkText, setBulkText] = useState("");
  const [bulkTitle, setBulkTitle] = useState("Lyrics");
  const [linesPerSlide, setLinesPerSlide] = useState(2);
  const [maxCharactersPerLine, setMaxCharactersPerLine] = useState(52);
  const [editingSlideId, setEditingSlideId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState("");
  const [draftSlideId, setDraftSlideId] = useState<string | null>(null);
  const [songs, setSongs] = useState<SongLibraryEntry[]>([]);
  const [selectedSongId, setSelectedSongId] = useState("");
  const [songUrl, setSongUrl] = useState("");
  const [songLibraryMessage, setSongLibraryMessage] = useState<string | null>(null);
  const [songLibraryLoading, setSongLibraryLoading] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const activeIndex = useMemo(
    () => lowerThird.slides.findIndex((slide) => slide.id === lowerThird.activeSlideId),
    [lowerThird.activeSlideId, lowerThird.slides]
  );
  const activeSlide = activeIndex >= 0 ? lowerThird.slides[activeIndex] : null;
  const navigationSlides = useMemo(
    () => activeSlide?.deckId
      ? lowerThird.slides.filter((slide) => slide.deckId === activeSlide.deckId)
      : lowerThird.slides,
    [activeSlide?.deckId, lowerThird.slides]
  );
  const navigationIndex = navigationSlides.findIndex((slide) => slide.id === lowerThird.activeSlideId);

  const refreshSongs = async () => {
    try {
      const next = await window.dualcast.listSongs();
      setSongs(next);
      if (selectedSongId && !next.some((song) => song.id === selectedSongId)) setSelectedSongId("");
    } catch {
      setSongs([]);
    }
  };

  useEffect(() => {
    void refreshSongs();
  }, []);

  const saveLowerThird = (update: Partial<typeof lowerThird>) =>
    updateSettings({ lowerThird: { ...lowerThird, ...update } });

  const activateSlide = (slideId: string | null) => stageLowerThird(lowerThird.slides, slideId);

  const moveSlide = (direction: -1 | 1) => {
    if (navigationSlides.length === 0) {
      return;
    }
    const current = navigationIndex < 0 ? (direction > 0 ? -1 : navigationSlides.length) : navigationIndex;
    const nextIndex = Math.max(0, Math.min(navigationSlides.length - 1, current + direction));
    void activateSlide(navigationSlides[nextIndex].id);
  };

  const addManualSlide = () => {
    const text = manualText.trim();
    if (!text) {
      return;
    }
    const deckId = createId();
    const slide: LowerThirdSlide = { id: createId(), text, kind: "text", deckId, deckTitle: "Manual Text" };
    void stageLowerThird([...lowerThird.slides, slide], slide.id);
    setManualText("");
  };

  const splitBulkText = () => {
    const deckId = createId();
    const slides = splitTextIntoSlides(bulkText, { linesPerSlide, maxCharactersPerLine })
      .map<LowerThirdSlide>((text) => ({ id: createId(), text, kind: "song", deckId, deckTitle: bulkTitle.trim() || "Lyrics" }));
    if (slides.length === 0) {
      return;
    }
    void stageLowerThird([...lowerThird.slides, ...slides], slides[0].id);
    setBulkText("");
    setBulkTitle("Lyrics");
  };

  const loadSelectedSong = () => {
    const song = songs.find((candidate) => candidate.id === selectedSongId);
    if (!song) return;
    setBulkTitle(song.title);
    setBulkText(song.lyrics);
    setSongLibraryMessage(`${song.title} loaded into the slide editor. Choose the line count, then create the slides.`);
  };

  const importSong = async () => {
    setSongLibraryLoading(true);
    try {
      const song = await window.dualcast.importSong();
      if (song) {
        await refreshSongs();
        setSelectedSongId(song.id);
        setBulkTitle(song.title);
        setBulkText(song.lyrics);
        setSongLibraryMessage(`${song.title} imported and loaded into the slide editor.`);
      }
    } catch (error) {
      setSongLibraryMessage(error instanceof Error ? error.message : "Unable to import the song.");
    } finally {
      setSongLibraryLoading(false);
    }
  };

  const downloadSong = async () => {
    if (!songUrl.trim()) return;
    setSongLibraryLoading(true);
    try {
      const song = await window.dualcast.downloadSong({ url: songUrl.trim() });
      await refreshSongs();
      setSelectedSongId(song.id);
      setBulkTitle(song.title);
      setBulkText(song.lyrics);
      setSongUrl("");
      setSongLibraryMessage(`${song.title} downloaded, saved and loaded into the slide editor.`);
    } catch (error) {
      setSongLibraryMessage(error instanceof Error ? error.message : "Unable to download the song.");
    } finally {
      setSongLibraryLoading(false);
    }
  };

  const removeSelectedSong = async () => {
    if (!selectedSongId) return;
    setSongLibraryLoading(true);
    try {
      await window.dualcast.removeSong({ songId: selectedSongId });
      setSelectedSongId("");
      await refreshSongs();
      setSongLibraryMessage("The selected downloaded song was removed from this computer.");
    } catch (error) {
      setSongLibraryMessage(error instanceof Error ? error.message : "Unable to remove the song.");
    } finally {
      setSongLibraryLoading(false);
    }
  };

  const removeSlide = (slideId: string) => {
    if (slideId === lowerThird.programSlideId) return;
    const slides = lowerThird.slides.filter((slide) => slide.id !== slideId);
    if (editingSlideId === slideId) {
      setEditingSlideId(null);
      setEditingText("");
      setDraftSlideId(null);
    }
    const nextActive = lowerThird.activeSlideId === slideId ? null : lowerThird.activeSlideId;
    if (lowerThird.activeSlideId === slideId) void stageLowerThird(slides, nextActive);
    else void saveLowerThird({ slides });
  };

  const beginEditSlide = (slide: LowerThirdSlide) => {
    setEditingSlideId(slide.id);
    setEditingText(slide.text);
  };

  const saveEditedSlide = () => {
    const text = editingText.trim();
    if (!editingSlideId || !text) return;
    const current = lowerThird.slides.find((slide) => slide.id === editingSlideId);
    if (!current) return;

    if (current.id === lowerThird.programSlideId) {
      const previewCopy = { ...current, id: createId(), text };
      void stageLowerThird(insertSlideAfter(lowerThird.slides, current.id, previewCopy), previewCopy.id);
    } else {
      void stageLowerThird(
        lowerThird.slides.map((slide) => slide.id === editingSlideId ? { ...slide, text } : slide),
        editingSlideId
      );
    }
    setEditingSlideId(null);
    setEditingText("");
    setDraftSlideId(null);
  };

  const addSlideAfterEditing = () => {
    const text = editingText.trim();
    if (!editingSlideId || !text) return;
    const current = lowerThird.slides.find((slide) => slide.id === editingSlideId);
    if (!current) return;
    const draft: LowerThirdSlide = { ...current, id: createId(), text: "" };
    if (current.id === lowerThird.programSlideId) {
      const previewCopy = { ...current, id: createId(), text };
      const withPreviewCopy = insertSlideAfter(lowerThird.slides, current.id, previewCopy);
      void stageLowerThird(insertSlideAfter(withPreviewCopy, previewCopy.id, draft), previewCopy.id);
    } else {
      const updated = lowerThird.slides.map((slide) => slide.id === current.id ? { ...slide, text } : slide);
      void stageLowerThird(insertSlideAfter(updated, current.id, draft), current.id);
    }
    setEditingSlideId(draft.id);
    setEditingText("");
    setDraftSlideId(draft.id);
  };

  const splitEditedSlide = () => {
    if (!editingSlideId) return;
    const current = lowerThird.slides.find((slide) => slide.id === editingSlideId);
    if (!current) return;
    if (current.id === lowerThird.programSlideId) {
      const lines = splitSlideLines(editingText);
      if (lines.length < 2) return;
      const replacements = lines.map((text) => ({ ...current, id: createId(), text }));
      const currentIndex = lowerThird.slides.findIndex((slide) => slide.id === current.id);
      const slides = [...lowerThird.slides];
      slides.splice(currentIndex + 1, 0, ...replacements);
      void stageLowerThird(slides, replacements[0].id);
      setEditingSlideId(null);
      setEditingText("");
      setDraftSlideId(null);
      return;
    }
    const result = replaceSlideWithLines(lowerThird.slides, editingSlideId, editingText, createId);
    if (!result) return;
    void stageLowerThird(result.slides, result.activeSlideId);
    setEditingSlideId(null);
    setEditingText("");
    setDraftSlideId(null);
  };

  const cancelSlideEdit = () => {
    if (draftSlideId) {
      void stageLowerThird(
        lowerThird.slides.filter((slide) => slide.id !== draftSlideId),
        lowerThird.activeSlideId === draftSlideId ? null : lowerThird.activeSlideId
      );
    }
    setEditingSlideId(null);
    setEditingText("");
    setDraftSlideId(null);
  };

  const chooseImage = async (field: "imageUrl" | "bibleImageUrl" | "backgroundImageUrl") => {
    const image = await window.dualcast.selectMediaFile({ kind: "image" });
    if (image) {
      await saveLowerThird({ [field]: image.fileUrl });
    }
  };

  return (
    <div
      className="compact-dock-panel lower-third-studio"
      ref={panelRef}
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target instanceof HTMLSelectElement) {
          return;
        }
        if (event.key === "ArrowRight" || event.key === "ArrowDown") {
          event.preventDefault();
          moveSlide(1);
        }
        if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
          event.preventDefault();
          moveSlide(-1);
        }
      }}
    >
      <div className="panel-header">
        <h2>Lower Third Studio</h2>
        <span className="tag">{activeSlide ? `Preview ${navigationIndex + 1}/${navigationSlides.length}` : "Preview Clear"}</span>
      </div>

      <div className="presentation-safety-card">
        <strong>Text Layer Safety</strong>
        <span>{lowerThird.allowMultipleTextLayers ? "Multiple presentation text layers are allowed." : "One presentation text layer at a time (recommended)."}</span>
        <label className="feature-toggle">
          <input
            type="checkbox"
            checked={lowerThird.allowMultipleTextLayers}
            onChange={(event) => saveLowerThird({ allowMultipleTextLayers: event.target.checked })}
          />
          Allow more than one text presentation on screen
        </label>
        <span className="field-help">When off, staging lyrics or Scripture removes the previous managed text from Preview. Program changes only when you TAKE or use Take Text Live.</span>
      </div>

      <div className="field">
        <label htmlFor="manualLowerThird">Manual lower-third text</label>
        <textarea
          id="manualLowerThird"
          value={manualText}
          onChange={(event) => setManualText(event.target.value)}
          placeholder="Type a name, announcement, title, or message"
        />
        <button className="btn btn-primary" onClick={addManualSlide} disabled={!manualText.trim()}>Add and Show</button>
      </div>

      <div className="field">
        <label htmlFor="bulkLowerThird">Songs, lyrics or long text</label>
        <input aria-label="Song or presentation title" value={bulkTitle} onChange={(event) => setBulkTitle(event.target.value)} placeholder="Song or presentation title" />
        <textarea
          id="bulkLowerThird"
          className="bulk-slide-input"
          value={bulkText}
          onChange={(event) => setBulkText(event.target.value)}
          placeholder={"Paste lyrics or text here. Keep each sung line on a new line. Blank lines may separate verses."}
        />
        <div className="field-grid presentation-split-options">
          <label className="field">
            <span>Lines per slide</span>
            <select value={linesPerSlide} onChange={(event) => setLinesPerSlide(Number(event.target.value))}>
              {[1, 2, 3, 4, 5, 6].map((value) => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Approx. characters per line</span>
            <input type="number" min={18} max={120} value={maxCharactersPerLine} onChange={(event) => setMaxCharactersPerLine(Number(event.target.value))} />
          </label>
        </div>
        <button className="btn btn-outline" onClick={splitBulkText} disabled={!bulkText.trim()}>Auto-Separate Text into Slides</button>
        <span className="field-help">The app wraps long lines, then groups one or more lines into each slide using your selection.</span>
      </div>

      <details className="song-library-manager">
        <summary>Downloaded and Imported Songs</summary>
        <div className="field">
          <label htmlFor="savedSong">Saved song</label>
          <select id="savedSong" value={selectedSongId} onChange={(event) => setSelectedSongId(event.target.value)}>
            <option value="">Choose a saved song</option>
            {songs.map((song) => <option key={song.id} value={song.id}>{song.title}</option>)}
          </select>
          <div className="field-row">
            <button className="btn btn-outline" onClick={loadSelectedSong} disabled={!selectedSongId}>Load Song</button>
            <button className="btn btn-danger" onClick={() => void removeSelectedSong()} disabled={!selectedSongId || songLibraryLoading}>Remove</button>
          </div>
        </div>
        <div className="field">
          <label htmlFor="songDownloadUrl">HTTPS lyrics or song JSON address</label>
          <input id="songDownloadUrl" type="url" value={songUrl} onChange={(event) => setSongUrl(event.target.value)} placeholder="https://example.org/licensed-song.txt" />
          <button className="btn btn-outline" onClick={() => void downloadSong()} disabled={!songUrl.trim() || songLibraryLoading}>Download and Save Song</button>
        </div>
        <button className="btn btn-outline" onClick={() => void importSong()} disabled={songLibraryLoading}>Import TXT, MD or JSON Song</button>
        <span className="field-help">Downloaded songs remain available offline. Use only lyrics you are licensed or permitted to download and display.</span>
        {songLibraryMessage ? <p className="panel-note">{songLibraryMessage}</p> : null}
      </details>

      <div className="lower-third-navigation">
        <button className="btn btn-outline" onClick={() => moveSlide(-1)} disabled={navigationSlides.length === 0}>Previous</button>
        <button className="btn btn-danger" onClick={() => void activateSlide(null)}>Clear Preview</button>
        <button className="btn btn-outline" onClick={() => moveSlide(1)} disabled={navigationSlides.length === 0}>Next</button>
      </div>
      <div className="lower-third-navigation lower-third-live-actions">
        <button className="btn btn-primary" onClick={() => void takeLowerThirdToProgram()} disabled={lowerThird.activeSlideId === lowerThird.programSlideId}>Take Text Live</button>
        <button className="btn btn-danger" onClick={() => void clearProgramText()} disabled={!lowerThird.programSlideId}>Clear Program Text</button>
      </div>
      <div className="field-help">Preview is private. TAKE sends the scene and staged text together; Take Text Live changes only the text. Arrow keys move within the selected song or Scripture deck.</div>

      <div className="lower-third-slide-list">
        {lowerThird.slides.map((slide, index) => (
          <div key={slide.id} className={`lower-third-slide ${slide.id === lowerThird.activeSlideId ? "active" : ""} ${editingSlideId === slide.id ? "editing" : ""}`}>
            {editingSlideId === slide.id ? (
              <div className="lower-third-slide-editor">
                <label htmlFor={`edit-slide-${slide.id}`}>Edit slide {index + 1}</label>
                <textarea id={`edit-slide-${slide.id}`} value={editingText} onChange={(event) => setEditingText(event.target.value)} autoFocus />
                <div className="field-row">
                  <button className="btn btn-primary btn-compact" onClick={saveEditedSlide} disabled={!editingText.trim()}>Save &amp; Show</button>
                  <button className="btn btn-outline btn-compact" onClick={addSlideAfterEditing} disabled={!editingText.trim()}>Add Slide After</button>
                  <button className="btn btn-outline btn-compact" onClick={splitEditedSlide} disabled={splitSlideLines(editingText).length < 2}>Each Line → Slide</button>
                  <button className="btn btn-outline btn-compact" onClick={cancelSlideEdit}>Cancel</button>
                </div>
                <span className="field-help">Each Line → Slide keeps the first line here and inserts every remaining non-empty line directly after it.</span>
              </div>
            ) : (
              <button className="lower-third-slide-cue" onClick={() => void activateSlide(slide.id)}>
                <span>{index + 1}</span>
                <strong>{slide.text}</strong>
                {slide.reference ? <small>{slide.reference}</small> : null}
                {slide.deckTitle ? <small>{slide.deckTitle}</small> : null}
                {slide.id === lowerThird.programSlideId ? <small>PROGRAM LIVE</small> : null}
              </button>
            )}
            <div className="lower-third-slide-actions">
              {editingSlideId !== slide.id ? <button className="btn btn-outline btn-compact" onClick={() => beginEditSlide(slide)}>Edit</button> : null}
              <button
                className="btn btn-danger btn-compact"
                onClick={() => removeSlide(slide.id)}
                disabled={slide.id === lowerThird.programSlideId}
                title={slide.id === lowerThird.programSlideId ? "Clear or replace the live Program text before deleting this slide." : "Delete slide"}
              >×</button>
            </div>
          </div>
        ))}
        {lowerThird.slides.length === 0 ? <div className="empty-hint">No lower-third slides yet.</div> : null}
      </div>

      <details className="lower-third-formatting">
        <summary>Formatting and Animation</summary>
        <div className="field-grid">
          <div className="field">
            <label htmlFor="lowerThirdFont">Font</label>
            <select id="lowerThirdFont" value={lowerThird.fontFamily} onChange={(event) => saveLowerThird({ fontFamily: event.target.value })}>
              <option value="Segoe UI">Segoe UI</option>
              <option value="Arial">Arial</option>
              <option value="Georgia">Georgia</option>
              <option value="Times New Roman">Times New Roman</option>
              <option value="Trebuchet MS">Trebuchet MS</option>
              <option value="Verdana">Verdana</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="lowerThirdFontSize">Font Size</label>
            <input id="lowerThirdFontSize" type="number" min={16} max={160} value={lowerThird.fontSize} onChange={(event) => saveLowerThird({ fontSize: Number(event.target.value) })} />
          </div>
          <div className="field">
            <label htmlFor="lowerThirdTextColor">Text Color</label>
            <input id="lowerThirdTextColor" type="color" value={lowerThird.textColor} onChange={(event) => saveLowerThird({ textColor: event.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="lowerThirdBgColor">Background</label>
            <input id="lowerThirdBgColor" type="color" value={lowerThird.backgroundColor} onChange={(event) => saveLowerThird({ backgroundColor: event.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="lowerThirdBgOpacity">Background Opacity ({Math.round(lowerThird.backgroundOpacity * 100)}%)</label>
            <input id="lowerThirdBgOpacity" type="range" min={0} max={1} step={0.01} value={lowerThird.backgroundOpacity} onChange={(event) => saveLowerThird({ backgroundOpacity: Number(event.target.value) })} />
          </div>
          <div className="field">
            <label htmlFor="lowerThirdAlign">Alignment</label>
            <select id="lowerThirdAlign" value={lowerThird.textAlign} onChange={(event) => saveLowerThird({ textAlign: event.target.value as typeof lowerThird.textAlign })}>
              <option value="left">Left</option>
              <option value="center">Center</option>
              <option value="right">Right</option>
            </select>
          </div>
          <div className="field">
            <label htmlFor="lowerThirdMaxLines">Maximum Lines</label>
            <input id="lowerThirdMaxLines" type="number" min={0} max={20} value={lowerThird.maxLines} onChange={(event) => saveLowerThird({ maxLines: Number(event.target.value) })} />
            <span className="field-help">0 displays the complete text.</span>
          </div>
          <div className="field">
            <label htmlFor="lowerThirdEntrance">Entrance</label>
            <select id="lowerThirdEntrance" value={lowerThird.entranceAnimation} onChange={(event) => saveLowerThird({ entranceAnimation: event.target.value as LowerThirdAnimation })}>
              {animationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="lowerThirdExit">Exit</label>
            <select id="lowerThirdExit" value={lowerThird.exitAnimation} onChange={(event) => saveLowerThird({ exitAnimation: event.target.value as LowerThirdAnimation })}>
              {animationOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </div>
          <div className="field">
            <label htmlFor="lowerThirdDuration">Animation (ms)</label>
            <input id="lowerThirdDuration" type="number" min={100} max={3000} step={50} value={lowerThird.animationDurationMs} onChange={(event) => saveLowerThird({ animationDurationMs: Number(event.target.value) })} />
          </div>
        </div>
        <div className="feature-toggle-list">
          <label className="feature-toggle"><input type="checkbox" checked={lowerThird.bold} onChange={(event) => saveLowerThird({ bold: event.target.checked })} />Bold</label>
          <label className="feature-toggle"><input type="checkbox" checked={lowerThird.italic} onChange={(event) => saveLowerThird({ italic: event.target.checked })} />Italic</label>
          <label className="feature-toggle"><input type="checkbox" checked={lowerThird.underline} onChange={(event) => saveLowerThird({ underline: event.target.checked })} />Underline</label>
          <label className="feature-toggle"><input type="checkbox" checked={lowerThird.showOnProgram} onChange={(event) => saveLowerThird({ showOnProgram: event.target.checked })} />Show over Program</label>
        </div>
        <div className="field">
          <label>Standard Lower-Third Logo</label>
          <div className="field-row">
            <button className="btn btn-outline" onClick={() => chooseImage("imageUrl")}>Choose Image</button>
            {lowerThird.imageUrl ? <button className="btn btn-danger" onClick={() => saveLowerThird({ imageUrl: "" })}>Remove</button> : null}
          </div>
          {lowerThird.imageUrl ? <img className="lower-third-image-preview" src={lowerThird.imageUrl} alt="Lower-third graphic" /> : null}
          <select value={lowerThird.imagePosition} onChange={(event) => saveLowerThird({ imagePosition: event.target.value as typeof lowerThird.imagePosition })}>
            <option value="left">Image Left</option>
            <option value="right">Image Right</option>
            <option value="background">Image Background</option>
          </select>
        </div>
        <div className="field">
          <label>Bible Passage Logo / Image</label>
          <div className="field-row">
            <button className="btn btn-outline" onClick={() => chooseImage("bibleImageUrl")}>Choose Bible Image</button>
            {lowerThird.bibleImageUrl ? <button className="btn btn-danger" onClick={() => saveLowerThird({ bibleImageUrl: "" })}>Remove</button> : null}
          </div>
          {lowerThird.bibleImageUrl ? <img className="lower-third-image-preview" src={lowerThird.bibleImageUrl} alt="Bible passage graphic" /> : null}
          <select value={lowerThird.bibleImagePosition} onChange={(event) => saveLowerThird({ bibleImagePosition: event.target.value as typeof lowerThird.bibleImagePosition })}>
            <option value="left">Bible Image Left</option>
            <option value="right">Bible Image Right</option>
            <option value="background">Bible Image Background</option>
          </select>
          <span className="field-help">Used only for slides sent from the Scripture dock.</span>
        </div>
        <div className="field">
          <label>Lower-Third Background Image</label>
          <div className="field-row">
            <button className="btn btn-outline" onClick={() => chooseImage("backgroundImageUrl")}>Choose Background</button>
            {lowerThird.backgroundImageUrl ? <button className="btn btn-danger" onClick={() => saveLowerThird({ backgroundImageUrl: "" })}>Remove</button> : null}
          </div>
          {lowerThird.backgroundImageUrl ? <img className="lower-third-image-preview" src={lowerThird.backgroundImageUrl} alt="Lower-third background" /> : null}
          <label htmlFor="lowerThirdBgImageOpacity">Image Opacity ({Math.round(lowerThird.backgroundImageOpacity * 100)}%)</label>
          <input id="lowerThirdBgImageOpacity" type="range" min={0} max={1} step={0.01} value={lowerThird.backgroundImageOpacity} onChange={(event) => saveLowerThird({ backgroundImageOpacity: Number(event.target.value) })} />
        </div>
      </details>
    </div>
  );
};

export default LowerThirdPanel;

import React, { useMemo, useRef, useState } from "react";
import { LowerThirdAnimation, LowerThirdSlide } from "../../shared/types";
import { useAppStore } from "../store/useAppStore";

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
  const { settings, updateSettings } = useAppStore();
  const lowerThird = settings.lowerThird;
  const [manualText, setManualText] = useState("");
  const [bulkText, setBulkText] = useState("");
  const panelRef = useRef<HTMLDivElement>(null);
  const activeIndex = useMemo(
    () => lowerThird.slides.findIndex((slide) => slide.id === lowerThird.activeSlideId),
    [lowerThird.activeSlideId, lowerThird.slides]
  );

  const saveLowerThird = (update: Partial<typeof lowerThird>) =>
    updateSettings({ lowerThird: { ...lowerThird, ...update } });

  const activateSlide = (slideId: string | null) => saveLowerThird({ activeSlideId: slideId });

  const moveSlide = (direction: -1 | 1) => {
    if (lowerThird.slides.length === 0) {
      return;
    }
    const current = activeIndex < 0 ? (direction > 0 ? -1 : lowerThird.slides.length) : activeIndex;
    const nextIndex = Math.max(0, Math.min(lowerThird.slides.length - 1, current + direction));
    activateSlide(lowerThird.slides[nextIndex].id);
  };

  const addManualSlide = () => {
    const text = manualText.trim();
    if (!text) {
      return;
    }
    const slide: LowerThirdSlide = { id: createId(), text, kind: "text" };
    saveLowerThird({ slides: [...lowerThird.slides, slide], activeSlideId: slide.id });
    setManualText("");
  };

  const splitBulkText = () => {
    const slides = bulkText
      .trim()
      .split(/\r?\n\s*\r?\n/g)
      .map((text) => text.trim())
      .filter(Boolean)
      .map<LowerThirdSlide>((text) => ({ id: createId(), text, kind: "song" }));
    if (slides.length === 0) {
      return;
    }
    saveLowerThird({ slides: [...lowerThird.slides, ...slides], activeSlideId: slides[0].id });
    setBulkText("");
  };

  const removeSlide = (slideId: string) => {
    const slides = lowerThird.slides.filter((slide) => slide.id !== slideId);
    saveLowerThird({
      slides,
      activeSlideId: lowerThird.activeSlideId === slideId ? slides[0]?.id ?? null : lowerThird.activeSlideId
    });
  };

  const chooseImage = async () => {
    const image = await window.dualcast.selectMediaFile({ kind: "image" });
    if (image) {
      await saveLowerThird({ imageUrl: image.fileUrl });
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
        <span className="tag">{activeIndex >= 0 ? `${activeIndex + 1}/${lowerThird.slides.length}` : "Off"}</span>
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
        <label htmlFor="bulkLowerThird">Songs or long text</label>
        <textarea
          id="bulkLowerThird"
          className="bulk-slide-input"
          value={bulkText}
          onChange={(event) => setBulkText(event.target.value)}
          placeholder={"Paste lyrics or text here.\n\nLeave one blank line between slides."}
        />
        <button className="btn btn-outline" onClick={splitBulkText} disabled={!bulkText.trim()}>Split Blank Lines into Slides</button>
      </div>

      <div className="lower-third-navigation">
        <button className="btn btn-outline" onClick={() => moveSlide(-1)} disabled={lowerThird.slides.length === 0}>Previous</button>
        <button className="btn btn-danger" onClick={() => activateSlide(null)}>Clear Live</button>
        <button className="btn btn-outline" onClick={() => moveSlide(1)} disabled={lowerThird.slides.length === 0}>Next</button>
      </div>
      <div className="field-help">Focus this dock and use the arrow keys to move between slides.</div>

      <div className="lower-third-slide-list">
        {lowerThird.slides.map((slide, index) => (
          <div key={slide.id} className={`lower-third-slide ${slide.id === lowerThird.activeSlideId ? "active" : ""}`}>
            <button className="lower-third-slide-cue" onClick={() => activateSlide(slide.id)}>
              <span>{index + 1}</span>
              <strong>{slide.text}</strong>
              {slide.reference ? <small>{slide.reference}</small> : null}
            </button>
            <button className="btn btn-danger btn-compact" onClick={() => removeSlide(slide.id)}>×</button>
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
          <label>Animated Image / Logo</label>
          <div className="field-row">
            <button className="btn btn-outline" onClick={chooseImage}>Choose Image</button>
            {lowerThird.imageUrl ? <button className="btn btn-danger" onClick={() => saveLowerThird({ imageUrl: "" })}>Remove</button> : null}
          </div>
          {lowerThird.imageUrl ? <img className="lower-third-image-preview" src={lowerThird.imageUrl} alt="Lower-third graphic" /> : null}
          <select value={lowerThird.imagePosition} onChange={(event) => saveLowerThird({ imagePosition: event.target.value as typeof lowerThird.imagePosition })}>
            <option value="left">Image Left</option>
            <option value="right">Image Right</option>
            <option value="background">Image Background</option>
          </select>
        </div>
      </details>
    </div>
  );
};

export default LowerThirdPanel;

import React from "react";
import { ScrollingTextData, SourceRect } from "../../shared/types";

type Props = {
  data: ScrollingTextData; paused: boolean; disabled: boolean;
  onChange: (update: Partial<ScrollingTextData>) => void;
  onPlace: (rect: SourceRect) => void; onPause: () => void; onRestart: () => void;
};

const ScrollingTextControls: React.FC<Props> = ({ data, paused, disabled, onChange, onPlace, onPause, onRestart }) => {
  const number = (key: "fontSize" | "speed" | "gap" | "padding" | "logoWidthPercent", label: string, min: number, max: number) => (
    <div className="field"><label htmlFor={`scroll-${key}`}>{label}</label><input id={`scroll-${key}`} type="number" min={min} max={max} value={data[key]} onChange={event => onChange({ [key]: Number(event.target.value) })} /></div>
  );
  const image = (key: "backgroundImageUrl" | "logoUrl", label: string) => (
    <div className="field">
      <label htmlFor={`scroll-${key}`}>{label}</label>
      <input id={`scroll-${key}`} value={data[key]} onChange={event => onChange({ [key]: event.target.value })} placeholder="Choose an image file or enter an image URL" />
      <div className="button-row">
        <button onClick={async () => { const result = await window.dualcast.selectMediaFile({ kind: "image" }); if (result) onChange({ [key]: result.fileUrl }); }}>Choose {label.toLowerCase()}</button>
        <button onClick={() => onChange({ [key]: "" })} disabled={!data[key]}>Remove {label.toLowerCase()}</button>
      </div>
    </div>
  );
  return (
    <fieldset className="scrolling-text-controls" disabled={disabled}>
      <legend>Scrolling message</legend>
      <div className="field"><label htmlFor="scroll-text">Message</label><textarea id="scroll-text" value={data.text} onChange={event => onChange({ text: event.target.value })} rows={4} /></div>
      <div className="field-grid">
        <div className="field"><label htmlFor="scroll-direction">Direction</label><select id="scroll-direction" value={data.direction} onChange={event => onChange({ direction: event.target.value as ScrollingTextData["direction"] })}><option value="left">Right to left</option><option value="right">Left to right</option><option value="up">Bottom to top</option><option value="down">Top to bottom</option></select></div>
        {number("speed", "Speed (px/sec at 1080p)", 0, 1000)}
        {number("fontSize", "Font size (at 1080p)", 8, 400)}
        <div className="field"><label htmlFor="scroll-font">Font</label><select id="scroll-font" value={data.fontFamily} onChange={event => onChange({ fontFamily: event.target.value })}>{["Segoe UI", "Arial", "Verdana", "Tahoma", "Georgia", "Times New Roman", "Courier New"].map(font => <option key={font}>{font}</option>)}</select></div>
        <div className="field"><label htmlFor="scroll-textColor">Text color</label><input id="scroll-textColor" type="color" value={data.textColor} onChange={event => onChange({ textColor: event.target.value })} /></div>
        <div className="field"><label htmlFor="scroll-backgroundColor">Background color</label><input id="scroll-backgroundColor" type="color" value={data.backgroundColor} onChange={event => onChange({ backgroundColor: event.target.value })} /></div>
      </div>
      <div className="button-row"><label><input type="checkbox" checked={data.bold} onChange={event => onChange({ bold: event.target.checked })} /> Bold</label><label><input type="checkbox" checked={data.italic} onChange={event => onChange({ italic: event.target.checked })} /> Italic</label><label><input type="checkbox" checked={data.loop} onChange={event => onChange({ loop: event.target.checked })} /> Repeat continuously</label></div>
      <div className="field"><label htmlFor="scroll-opacity">Background opacity ({Math.round(data.backgroundOpacity * 100)}%)</label><input id="scroll-opacity" type="range" min={0} max={1} step={0.05} value={data.backgroundOpacity} onChange={event => onChange({ backgroundOpacity: Number(event.target.value) })} /></div>
      {image("backgroundImageUrl", "Background image")}
      <div className="field-grid">
        <div className="field"><label htmlFor="scroll-fit">Background fit</label><select id="scroll-fit" value={data.backgroundFit} onChange={event => onChange({ backgroundFit: event.target.value as ScrollingTextData["backgroundFit"] })}><option value="cover">Fill / crop</option><option value="contain">Fit inside</option><option value="stretch">Stretch</option></select></div>
        <div className="field"><label htmlFor="scroll-align">Vertical-scroll text alignment</label><select id="scroll-align" value={data.align} onChange={event => onChange({ align: event.target.value as ScrollingTextData["align"] })}><option value="left">Left</option><option value="center">Center</option><option value="right">Right</option></select></div>
        {number("gap", "Gap between repeats", 16, 2000)}{number("padding", "Inner padding", 0, 200)}
      </div>
      {image("logoUrl", "Logo")}
      <div className="field-grid">
        <div className="field"><label htmlFor="scroll-logoSide">Logo side</label><select id="scroll-logoSide" value={data.logoPosition} onChange={event => onChange({ logoPosition: event.target.value as "left" | "right" })}><option value="left">Left</option><option value="right">Right</option></select></div>
        {number("logoWidthPercent", "Logo area width (%)", 3, 40)}
      </div>
      <p className="field-help">The logo stays fixed beside the message. Text is clipped to its own area and cannot scroll under the logo. Remote image URLs must allow cross-origin use; choose a local file if an image does not load.</p>
      <div className="button-row"><button onClick={() => onPlace({ x: 0, y: 0, width: 100, height: 12 })}>Top banner</button><button onClick={() => onPlace({ x: 0, y: 88, width: 100, height: 12 })}>Bottom banner</button><button onClick={() => onPlace({ x: 2, y: 10, width: 26, height: 80 })}>Left panel</button><button onClick={() => onPlace({ x: 72, y: 10, width: 26, height: 80 })}>Right panel</button></div>
      <div className="button-row"><button onClick={onPause}>{paused ? "Resume in Preview" : "Pause in Preview"}</button><button onClick={onRestart}>Restart in Preview</button></div>
      <p className="field-help">Drag or resize the source in Preview, or set X, Y, W and H below. Changes are staged; TAKE sends them live.</p>
    </fieldset>
  );
};
export default ScrollingTextControls;

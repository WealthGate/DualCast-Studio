import React, { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { SourceCrop } from "../../shared/types";

type Props = { imageUrl: string; crop?: SourceCrop; onApply: (crop: SourceCrop) => void; onClose: () => void };

const CaptureRegionPicker: React.FC<Props> = ({ imageUrl, crop, onApply, onClose }) => {
  const [selection, setSelection] = useState(crop ?? { top: 0, right: 0, bottom: 0, left: 0 });
  const anchor = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); onClose(); } };
    document.addEventListener("keydown", escape, true);
    return () => document.removeEventListener("keydown", escape, true);
  }, [onClose]);
  const point = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: Math.max(0, Math.min(100, (event.clientX - bounds.left) / bounds.width * 100)), y: Math.max(0, Math.min(100, (event.clientY - bounds.top) / bounds.height * 100)) };
  };
  const valid = Object.values(selection).every(value => value <= 95) && selection.left + selection.right <= 95 && selection.top + selection.bottom <= 95;
  return createPortal(
    <div className="modal-backdrop" onClick={onClose}>
      <section className="studio-modal capture-region-modal" role="dialog" aria-modal="true" aria-label="Select video-only area" onClick={event => event.stopPropagation()}>
        <h2>Select video-only area</h2>
        <p>Drag around the video. Leave meeting controls, participant lists, and chat outside the selected area.</p>
        <div className="capture-region-image" onPointerDown={event => {
          anchor.current = point(event); event.currentTarget.setPointerCapture(event.pointerId);
        }} onPointerMove={event => {
          if (!anchor.current) return;
          const next = point(event), start = anchor.current;
          setSelection({ left: Math.min(start.x, next.x), right: 100 - Math.max(start.x, next.x), top: Math.min(start.y, next.y), bottom: 100 - Math.max(start.y, next.y) });
        }} onPointerUp={() => { anchor.current = null; }} onPointerCancel={() => { anchor.current = null; }}>
          <img src={imageUrl} alt="Full captured window. Drag to select the video region." draggable={false} />
          <div className="capture-region-selection" style={{ left: `${selection.left}%`, right: `${selection.right}%`, top: `${selection.top}%`, bottom: `${selection.bottom}%` }} />
        </div>
        <p className="field-help">Keep the meeting window size and layout fixed after cropping. For a clean feed, prefer the app's separate video-only window. Notifications drawn inside the selected video remain visible; disable them in the meeting app.</p>
        <div className="button-row">
          <button onClick={() => setSelection({ top: 0, right: 0, bottom: 0, left: 0 })}>Full window</button>
          <button onClick={onClose}>Cancel</button>
          <button disabled={!valid} onClick={() => onApply(selection)}>Apply to Preview</button>
        </div>
      </section>
    </div>, document.body
  );
};
export default CaptureRegionPicker;

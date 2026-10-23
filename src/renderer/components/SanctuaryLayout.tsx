import React, { useLayoutEffect, useState } from "react";
import { SanctuaryDisplayState } from "../../shared/types";
import ScrollingTextOverlay from "./ScrollingTextOverlay";

type Props = { state: SanctuaryDisplayState; black?: boolean; preview?: boolean; frameRate?: number };
const SanctuaryLayout: React.FC<Props> = ({ state, black = false, preview = false, frameRate = 30 }) => {
  const config = state.settings;
  const logoOnly = state.textMode === "logo";
  const visible = !black && state.textMode === "show" && Boolean(state.text || state.reference);
  const duration = Math.max(100, Math.min(3000, state.exitDurationMs ?? 450));
  const [retained, setRetained] = useState({ text: state.text, reference: state.reference });
  useLayoutEffect(() => {
    if (visible) { setRetained({ text: state.text, reference: state.reference }); return; }
    const timer = window.setTimeout(() => setRetained({ text: "", reference: "" }), duration);
    return () => window.clearTimeout(timer);
  }, [visible, state.text, state.reference, duration]);
  return (
    <div className={`sanctuary-layout ${preview ? "sanctuary-layout-preview" : ""}`} style={{ backgroundColor: black || logoOnly ? "#000000" : config.backgroundColor }}>
      {!black && !logoOnly && config.backgroundUrl && (config.backgroundType === "image" ?
        <img className="sanctuary-background" src={config.backgroundUrl} alt="" style={{ objectFit: config.backgroundFit }} /> :
        config.backgroundType === "video" ? <video key={config.backgroundUrl} className="sanctuary-background" src={config.backgroundUrl} autoPlay muted loop playsInline style={{ objectFit: config.backgroundFit }} /> : null)}
      {!black && !logoOnly && <div className="sanctuary-background-shade" style={{ backgroundColor: `rgba(0, 0, 0, ${config.backgroundDim})` }} />}
      {!black && logoOnly && state.logoUrl && <img className="sanctuary-logo" src={state.logoUrl} alt="" />}
      {!black && Boolean(retained.text || retained.reference) && <div className="sanctuary-text" aria-hidden={!visible} style={{
        opacity: visible ? 1 : 0, transform: visible ? "translateY(0)" : "translateY(12px)", transition: `opacity ${duration}ms ease, transform ${duration}ms ease`,
        left: `${config.textRect.x}%`, top: `${config.textRect.y}%`, width: `${config.textRect.width}%`, height: `${config.textRect.height}%`,
        fontFamily: config.fontFamily, fontSize: `${config.fontSize / 19.2}cqw`, color: config.textColor,
        fontWeight: config.bold ? 700 : 400, fontStyle: config.italic ? "italic" : "normal",
        textAlign: config.textAlign, justifyContent: config.verticalAlign === "top" ? "flex-start" : config.verticalAlign === "bottom" ? "flex-end" : "center"
      }}><div>{retained.text}</div>{retained.reference && <div className="sanctuary-reference">{retained.reference}</div>}</div>}
      {!black && !logoOnly && Boolean(state.scrollingSources?.length) && <ScrollingTextOverlay sources={state.scrollingSources!} showText={state.textMode === "show"} frameRate={frameRate} />}
    </div>
  );
};
export default SanctuaryLayout;

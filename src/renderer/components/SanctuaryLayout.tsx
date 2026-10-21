import React from "react";
import { SanctuaryDisplayState } from "../../shared/types";
import ScrollingTextOverlay from "./ScrollingTextOverlay";

type Props = { state: SanctuaryDisplayState; black?: boolean; preview?: boolean };
const SanctuaryLayout: React.FC<Props> = ({ state, black = false, preview = false }) => {
  const config = state.settings;
  const logoOnly = state.textMode === "logo";
  return (
    <div className={`sanctuary-layout ${preview ? "sanctuary-layout-preview" : ""}`} style={{ backgroundColor: black || logoOnly ? "#000000" : config.backgroundColor }}>
      {!black && !logoOnly && config.backgroundUrl && (config.backgroundType === "image" ?
        <img className="sanctuary-background" src={config.backgroundUrl} alt="" style={{ objectFit: config.backgroundFit }} /> :
        config.backgroundType === "video" ? <video key={config.backgroundUrl} className="sanctuary-background" src={config.backgroundUrl} autoPlay muted loop playsInline style={{ objectFit: config.backgroundFit }} /> : null)}
      {!black && !logoOnly && <div className="sanctuary-background-shade" style={{ backgroundColor: `rgba(0, 0, 0, ${config.backgroundDim})` }} />}
      {!black && logoOnly && state.logoUrl && <img className="sanctuary-logo" src={state.logoUrl} alt="" />}
      {!black && state.textMode === "show" && <div className="sanctuary-text" style={{
        left: `${config.textRect.x}%`, top: `${config.textRect.y}%`, width: `${config.textRect.width}%`, height: `${config.textRect.height}%`,
        fontFamily: config.fontFamily, fontSize: `${config.fontSize / 19.2}cqw`, color: config.textColor,
        fontWeight: config.bold ? 700 : 400, fontStyle: config.italic ? "italic" : "normal",
        textAlign: config.textAlign, justifyContent: config.verticalAlign === "top" ? "flex-start" : config.verticalAlign === "bottom" ? "flex-end" : "center"
      }}><div>{state.text}</div>{state.reference && <div className="sanctuary-reference">{state.reference}</div>}</div>}
      {!black && !logoOnly && Boolean(state.scrollingSources?.length) && <ScrollingTextOverlay sources={state.scrollingSources!} showText={state.textMode === "show"} />}
    </div>
  );
};
export default SanctuaryLayout;

import React, { useLayoutEffect, useRef, useState } from "react";
import { SanctuaryDisplayState } from "../../shared/types";
import ScrollingTextOverlay from "./ScrollingTextOverlay";
import BackgroundLayer from "./BackgroundLayer";
import { emptyLowerThirdCue, updateLowerThirdCue } from "../utils/lowerThirdCue";
import { sanctuaryTextKeyframes } from "../utils/sanctuaryAnimation";

type Props = { state: SanctuaryDisplayState; black?: boolean; preview?: boolean; frameRate?: number; frozen?: boolean };
const SanctuaryLayout: React.FC<Props> = ({ state, black = false, preview = false, frameRate = 30, frozen = false }) => {
  const config = state.settings;
  const logoOnly = state.textMode === "logo";
  const visible = !black && state.textMode === "show" && Boolean(state.text || state.reference);
  const duration = Math.max(100, Math.min(3000, state.exitDurationMs ?? 450));
  const [cue, setCue] = useState(emptyLowerThirdCue);
  const incoming = useRef<HTMLDivElement>(null), outgoing = useRef<HTMLDivElement>(null);
  const animations = useRef<Animation[]>([]);
  useLayoutEffect(() => {
    if (frozen || black) return;
    setCue(current => updateLowerThirdCue(current, visible ? { id: state.cueId ?? `${state.text}\n${state.reference}`, text: state.text, reference: state.reference } : null, "show", performance.now()));
  }, [visible, state.cueId, state.text, state.reference, frozen, black]);
  useLayoutEffect(() => {
    const run = (element: HTMLDivElement | null, exit: boolean) => {
      const kind = (exit ? state.exitAnimation : state.entranceAnimation) ?? "fade";
      if (!element?.animate) return null;
      const animation = element.animate(sanctuaryTextKeyframes(kind, exit), { duration: kind === "none" ? 0 : duration, easing: "cubic-bezier(.22,.61,.36,1)", fill: "both" });
      animations.current.push(animation);
      return animation;
    };
    run(incoming.current, false);
    const exit = run(outgoing.current, true);
    const retire = () => setCue(current => current.changedAt === cue.changedAt ? { ...current, previous: null } : current);
    if (exit) void exit.finished.then(retire).catch(() => undefined);
    const timer = cue.previous && !exit ? window.setTimeout(retire, duration) : undefined;
    return () => { window.clearTimeout(timer); animations.current.forEach(animation => animation.cancel()); animations.current = []; };
  }, [cue.changedAt, duration, state.entranceAnimation, state.exitAnimation]);
  useLayoutEffect(() => { const paused = frozen || black || logoOnly; animations.current.forEach(animation => { if (paused && animation.playState === "running") animation.pause(); else if (!paused && animation.playState === "paused") animation.play(); }); }, [frozen, black, logoOnly, cue.changedAt]);
  const textLayer = (slide: NonNullable<typeof cue.current>, exit: boolean) => <div key={`${exit ? "out" : "in"}:${slide.id}`} ref={exit ? outgoing : incoming} className="sanctuary-text" aria-hidden={exit || !visible} style={{
    visibility: black || logoOnly ? "hidden" : "visible",
    left: `${config.textRect.x}%`, top: `${config.textRect.y}%`, width: `${config.textRect.width}%`, height: `${config.textRect.height}%`,
    fontFamily: config.fontFamily, fontSize: `${config.fontSize / 19.2}cqw`, color: config.textColor,
    fontWeight: config.bold ? 800 : 400, fontStyle: config.italic ? "italic" : "normal",
    textAlign: config.textAlign, justifyContent: config.verticalAlign === "top" ? "flex-start" : config.verticalAlign === "bottom" ? "flex-end" : "center"
  }}><div>{slide.text}</div>{slide.reference && <div className="sanctuary-reference">{slide.reference}</div>}</div>;
  return (
    <div className={`sanctuary-layout ${preview ? "sanctuary-layout-preview" : ""}`} style={{ backgroundColor: black || logoOnly ? "#000000" : state.background?.color ?? config.backgroundColor }}>
      {state.background && <div style={{ position: "absolute", inset: 0, visibility: black || logoOnly ? "hidden" : "visible" }}><BackgroundLayer background={state.background} frozen={frozen || black || logoOnly} /></div>}
      {!black && !logoOnly && !state.background && config.backgroundUrl && (config.backgroundType === "image" ?
        <img className="sanctuary-background" src={config.backgroundUrl} alt="" style={{ objectFit: config.backgroundFit }} /> :
        config.backgroundType === "video" ? <video key={config.backgroundUrl} className="sanctuary-background" src={config.backgroundUrl} autoPlay muted loop playsInline style={{ objectFit: config.backgroundFit }} /> : null)}
      {!black && !logoOnly && !state.background && <div className="sanctuary-background-shade" style={{ backgroundColor: `rgba(0, 0, 0, ${config.backgroundDim})` }} />}
      {!black && logoOnly && state.logoUrl && <img className="sanctuary-logo" src={state.logoUrl} alt="" />}
      {cue.previous && textLayer(cue.previous, true)}
      {cue.current && textLayer(cue.current, false)}
      {!black && !logoOnly && Boolean(state.scrollingSources?.length) && <ScrollingTextOverlay sources={state.scrollingSources!} showText={state.textMode === "show"} frameRate={frameRate} />}
    </div>
  );
};
export default SanctuaryLayout;

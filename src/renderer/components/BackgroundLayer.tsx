import React, { useEffect, useRef, useState } from "react";
import { BackgroundSelection } from "../../shared/backgrounds";

const BackgroundLayer: React.FC<{ background: BackgroundSelection; frozen?: boolean; onError?: () => void }> = ({ background, frozen = false, onError }) => {
  const video = useRef<HTMLVideoElement>(null);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const fail = () => { setFailedUrl(background.url); onError?.(); };
  useEffect(() => {
    const element = video.current;
    return () => { if (element) { element.pause(); element.removeAttribute("src"); element.load(); } };
  }, [background.url, background.kind]);
  useEffect(() => {
    const element = video.current;
    if (!element) return;
    let active = true;
    if (frozen) element.pause(); else void element.play().catch(() => { if (active) fail(); });
    return () => { active = false; };
  }, [background.url, background.kind, frozen]);
  if (!background.url || background.kind === "none" || failedUrl === background.url) return null;
  const style: React.CSSProperties = { position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: background.fit, opacity: background.opacity };
  return background.kind === "image" ? <img key={background.url} src={background.url} alt="" style={style} onError={fail} />
    : <video key={background.url} ref={video} src={background.url} muted loop playsInline autoPlay={!frozen} style={style} onError={fail} />;
};
export default BackgroundLayer;

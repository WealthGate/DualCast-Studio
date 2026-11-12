import { useEffect, useRef, useState } from "react";
import { BackgroundSelection } from "../../shared/backgrounds";

export function useCanvasBackground(selection?: BackgroundSelection) {
  const [revision, setRevision] = useState(0);
  const resource = useRef<{ key: string; media: HTMLImageElement | HTMLVideoElement } | null>(null);
  const key = `${selection?.kind ?? "none"}:${selection?.url ?? ""}`;
  useEffect(() => {
    resource.current = null;
    if (!selection || selection.kind === "none" || !selection.url) return;
    let active = true;
    const media = selection.kind === "video" ? document.createElement("video") : new Image();
    const ready = () => { if (active) { resource.current = { key, media }; setRevision(value => value + 1); } };
    const failed = () => { if (active) { resource.current = null; setRevision(value => value + 1); } };
    if (media instanceof HTMLVideoElement) {
      media.muted = true; media.volume = 0; media.loop = true; media.playsInline = true;
      media.addEventListener("loadeddata", ready); media.addEventListener("error", failed); media.src = selection.url;
      void media.play().catch(failed);
    } else { media.onload = ready; media.onerror = failed; media.src = selection.url; }
    return () => {
      active = false; resource.current = null;
      if (media instanceof HTMLVideoElement) { media.pause(); media.removeAttribute("src"); media.load(); }
      else { media.onload = null; media.onerror = null; }
    };
  }, [key]);
  return {
    revision, animated: selection?.kind === "video",
    draw(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, fillColor = false) {
      if (!selection) return;
      if (fillColor) { ctx.fillStyle = selection.color; ctx.fillRect(x, y, width, height); }
      const current = resource.current;
      if (!current || current.key !== key || selection.kind === "none") return;
      const media = current.media;
      const w = media instanceof HTMLVideoElement ? media.videoWidth : media.naturalWidth;
      const h = media instanceof HTMLVideoElement ? media.videoHeight : media.naturalHeight;
      if (!w || !h) return;
      const scale = (selection.fit === "contain" ? Math.min : Math.max)(width / w, height / h);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y, width, height); ctx.clip();
      ctx.globalAlpha *= selection.opacity;
      ctx.drawImage(media, x + (width - w * scale) / 2, y + (height - h * scale) / 2, w * scale, h * scale);
      ctx.restore();
    }
  };
}

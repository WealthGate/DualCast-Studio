import { ScrollingTextData, Source } from "../../shared/types";

export type ScrollingTextSource = Extract<Source, { type: "scrolling-text" }>;
type ScrollState = {
  distance: number; lastAt: number; contentKey: string;
  layoutKey?: string; lines?: string[]; length?: number;
  backgroundKey?: string; background?: HTMLCanvasElement;
};

export const scrollingTextLayout = (data: ScrollingTextData, width: number, height: number, scale: number) => {
  const padding = Math.min(data.padding * scale, width / 4, height / 4);
  const logoWidth = data.logoUrl ? Math.max(0, Math.min(width * data.logoWidthPercent / 100, width - 2 * padding - 1)) : 0;
  const reserved = logoWidth > 0 ? logoWidth + padding : 0;
  return { padding, logoWidth, textX: padding + (data.logoPosition === "left" ? reserved : 0), textWidth: Math.max(1, width - 2 * padding - reserved), textHeight: Math.max(1, height - 2 * padding) };
};

export const scrollingPositions = (length: number, viewport: number, distance: number, gap: number, positive: boolean, loop: boolean) => {
  if (!loop) return [positive ? -length + distance : viewport - distance];
  const period = Math.max(1, length + gap);
  const offset = ((distance % period) + period) % period;
  const positions: number[] = [];
  for (let position = positive ? offset - period : -offset; position < viewport; position += period) positions.push(position);
  return positions;
};

const fitImage = (ctx: CanvasRenderingContext2D, image: HTMLImageElement, x: number, y: number, width: number, height: number, fit: ScrollingTextData["backgroundFit"]) => {
  if (fit === "stretch") { ctx.drawImage(image, x, y, width, height); return; }
  const ratio = fit === "cover" ? Math.max(width / image.naturalWidth, height / image.naturalHeight) : Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const w = image.naturalWidth * ratio, h = image.naturalHeight * ratio;
  ctx.drawImage(image, x + (width - w) / 2, y + (height - h) / 2, w, h);
};

const wrapLines = (ctx: CanvasRenderingContext2D, text: string, width: number) => text.split(/\r?\n/).flatMap(paragraph => {
  const lines: string[] = [];
  let line = "";
  for (const word of paragraph.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(next).width > width) { lines.push(line); line = word; } else line = next;
  }
  lines.push(line);
  return lines;
});

// One clock per source/snapshot, shared across draws in the same frame. Fonts
// scale relative to a 1920px output; speed is reference pixels per second.
export class ScrollingTextRenderer {
  private states = new Map<string, ScrollState>();
  private images = new Map<string, HTMLImageElement>();

  private image(url: string) {
    if (!url) return null;
    let image = this.images.get(url);
    if (!image) {
      image = new Image();
      if (/^https?:/i.test(url)) image.crossOrigin = "anonymous";
      image.src = url;
      this.images.set(url, image);
    }
    return image.complete && image.naturalWidth ? image : null;
  }

  prune(sources: Source[]) {
    const ids = new Set(sources.map(source => source.id));
    for (const id of this.states.keys()) if (!ids.has(id)) this.states.delete(id);
    const urls = new Set(sources.flatMap(source => source.type === "scrolling-text" ? [source.data.backgroundImageUrl, source.data.logoUrl] : []));
    for (const url of this.images.keys()) if (!urls.has(url)) this.images.delete(url);
  }

  draw(ctx: CanvasRenderingContext2D, source: ScrollingTextSource, canvasWidth: number, canvasHeight: number, now: number, showText = true) {
    if (!source.enabled) return;
    const data = source.data, scale = canvasWidth / 1920;
    const width = canvasWidth * source.rect.width / 100, height = canvasHeight * source.rect.height / 100;
    if (width <= 0 || height <= 0) return;
    const contentKey = JSON.stringify([data.text, data.direction, data.loop, source.media?.restartToken ?? 0]);
    let state = this.states.get(source.id);
    if (!state || state.contentKey !== contentKey) {
      state = { distance: 0, lastAt: now, contentKey };
      this.states.set(source.id, state);
    }
    if (!source.media?.paused) state.distance += Math.max(0, now - state.lastAt) / 1000 * data.speed;
    state.lastAt = now;
    const layout = scrollingTextLayout(data, width, height, scale);
    const { padding, logoWidth, textX, textWidth, textHeight } = layout;
    const background = this.image(data.backgroundImageUrl), logo = this.image(data.logoUrl);
    const backgroundKey = JSON.stringify([width, height, data.backgroundColor, data.backgroundFit, data.backgroundImageUrl, background?.naturalWidth ?? 0]);
    if (!state.background || state.backgroundKey !== backgroundKey) {
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.ceil(width)); canvas.height = Math.max(1, Math.ceil(height));
      const bg = canvas.getContext("2d")!;
      bg.fillStyle = data.backgroundColor; bg.fillRect(0, 0, width, height);
      if (background) fitImage(bg, background, 0, 0, width, height, data.backgroundFit);
      state.background = canvas; state.backgroundKey = backgroundKey;
    }
    ctx.save();
    ctx.translate(canvasWidth * source.rect.x / 100 + width / 2, canvasHeight * source.rect.y / 100 + height / 2);
    ctx.rotate((source.rotation ?? 0) * Math.PI / 180);
    ctx.translate(-width / 2, -height / 2);
    const crop = source.crop ?? { top: 0, right: 0, bottom: 0, left: 0 };
    ctx.beginPath(); ctx.rect(width * crop.left / 100, height * crop.top / 100, width * (100 - crop.left - crop.right) / 100, height * (100 - crop.top - crop.bottom) / 100); ctx.clip();
    ctx.save(); ctx.globalAlpha *= data.backgroundOpacity;
    ctx.drawImage(state.background, 0, 0, width, height); ctx.restore();
    if (logo && logoWidth > 0) fitImage(ctx, logo, data.logoPosition === "left" ? padding : width - padding - logoWidth, padding, logoWidth, textHeight, "contain");
    if (showText && data.text.trim()) {
      ctx.save(); ctx.beginPath(); ctx.rect(textX, padding, textWidth, textHeight); ctx.clip(); ctx.translate(textX, padding);
      const fontSize = data.fontSize * scale;
      ctx.font = `${data.italic ? "italic " : ""}${data.bold ? "700" : "400"} ${fontSize}px "${data.fontFamily.replace(/["\\]/g, "")}", sans-serif`;
      ctx.fillStyle = data.textColor; ctx.textBaseline = "middle";
      const vertical = data.direction === "up" || data.direction === "down";
      const flatText = data.text.replace(/\s*\r?\n\s*/g, "   •   ");
      const lineHeight = fontSize * 1.25;
      const layoutKey = JSON.stringify([ctx.font, data.text, textWidth, vertical]);
      if (layoutKey !== state.layoutKey) {
        state.lines = vertical ? wrapLines(ctx, data.text, textWidth) : [flatText];
        state.length = vertical ? state.lines.length * lineHeight : ctx.measureText(flatText).width;
        state.layoutKey = layoutKey;
      }
      const positions = scrollingPositions(state.length ?? 0, vertical ? textHeight : textWidth, state.distance * scale, data.gap * scale, data.direction === "right" || data.direction === "down", data.loop);
      ctx.textAlign = vertical ? data.align : "left";
      const textLeft = data.align === "center" ? textWidth / 2 : data.align === "right" ? textWidth : 0;
      for (const position of positions) {
        if (vertical) state.lines?.forEach((line, index) => ctx.fillText(line, textLeft, position + (index + 0.5) * lineHeight));
        else ctx.fillText(flatText, position, textHeight / 2);
      }
      ctx.restore();
    }
    ctx.restore();
  }
}

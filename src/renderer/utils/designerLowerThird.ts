import type { LowerThirdAnimation, LowerThirdSettings, LowerThirdSlide } from "../../shared/types";
import { lowerThirdTitle, normalizeLowerThirdDesign, type LowerThirdDesign, type LowerThirdTextStyle } from "../../shared/lowerThirdDesign";
import { sanitizeScriptureText } from "../../shared/scriptureText";

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const ease = (value: number) => 1 - Math.pow(1 - clamp(value), 3);
export const wrapLowerThirdText = (text: string, width: number, measure: (text: string) => number) => {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      if (line && measure(`${line} ${word}`) <= width) { line += ` ${word}`; continue; }
      if (line) { lines.push(line); line = ""; }
      if (measure(word) <= width) { line = word; continue; }
      for (const character of Array.from(word)) {
        if (line && measure(line + character) > width) { lines.push(line); line = ""; }
        line += character;
      }
    }
    lines.push(line);
  }
  return lines;
};
const shapePath = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, shape: LowerThirdDesign["shape"]) => {
  ctx.beginPath();
  const cut = Math.min(h * .23, w * .06);
  if (shape === "slant") { ctx.moveTo(x + cut, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w - cut, y + h); ctx.lineTo(x, y + h); ctx.closePath(); }
  else if (shape === "cut-corner") { ctx.moveTo(x + cut, y); ctx.lineTo(x + w, y); ctx.lineTo(x + w, y + h - cut); ctx.lineTo(x + w - cut, y + h); ctx.lineTo(x, y + h); ctx.lineTo(x, y + cut); ctx.closePath(); }
  else ctx.roundRect(x, y, w, h, shape === "capsule" ? h / 2 : shape === "rounded" ? h * .16 : 0);
};
const drawText = (ctx: CanvasRenderingContext2D, text: string, style: LowerThirdTextStyle, x: number, y: number, w: number, h: number, scale: number) => {
  if (!text.trim()) return;
  let size = style.fontSize * scale;
  const font = () => { ctx.font = `${style.italic ? "italic " : ""}${style.weight ?? (style.bold ? 700 : 400)} ${size}px "${style.fontFamily.replace(/["\\]/g, "")}", sans-serif`; ctx.letterSpacing = `${style.letterSpacing * scale}px`; };
  font();
  let lines = wrapLowerThirdText(text, w, value => ctx.measureText(value).width);
  while (size > 8 * scale && lines.length * size * 1.22 > h) { size = Math.max(8 * scale, size - 1.5 * scale); font(); lines = wrapLowerThirdText(text, w, value => ctx.measureText(value).width); }
  ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
  ctx.fillStyle = style.color; ctx.textAlign = style.align; ctx.textBaseline = "middle";
  const textX = style.align === "left" ? x : style.align === "right" ? x + w : x + w / 2;
  const top = y + (h - lines.length * size * 1.22) / 2 + size * .61;
  for (let index = 0; index < lines.length; index++) {
    const lineY = top + index * size * 1.22;
    ctx.fillText(lines[index], textX, lineY, w);
    if (style.underline && lines[index]) {
      const width = Math.min(w, ctx.measureText(lines[index]).width);
      ctx.fillRect(style.align === "center" ? textX - width / 2 : style.align === "right" ? textX - width : textX, lineY + size * .45, width, Math.max(scale, size / 25));
    }
  }
  ctx.restore(); ctx.letterSpacing = "0px";
};

export const drawDesignerLowerThird = (
  ctx: CanvasRenderingContext2D, width: number, height: number, settings: LowerThirdSettings, slide: LowerThirdSlide,
  logo: HTMLImageElement | null, animation: LowerThirdAnimation = "none", phase: "enter" | "exit" = "enter", progress = 1,
  showText = true, background?: (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) => void
) => {
  const design = normalizeLowerThirdDesign(settings.design), scale = width / 1920;
  const areaHeight = height * settings.heightPercent / 100;
  const inset = height * design.insetPercent / 100;
  const w = width * design.widthPercent / 100, h = Math.max(50 * scale, areaHeight - Math.min(inset, areaHeight * .24));
  const x = design.side === "center" ? (width - w) / 2 : design.side === "right" ? width * .97 - w : width * .03;
  const y = settings.position === "top" ? Math.min(inset, areaHeight * .24) : height - h - Math.min(inset, areaHeight * .24);
  const title = slide.kind === "scripture" ? sanitizeScriptureText(lowerThirdTitle(slide)) : lowerThirdTitle(slide);
  const text = slide.kind === "scripture" ? sanitizeScriptureText(slide.text) : slide.text;
  const split = design.layout === "split" && Boolean(title), titleArea = split ? w * .27 : 0;
  const titleH = title ? split ? h : h * design.titleHeightPercent / 100 : 0;
  const bodyY = split ? y : y + titleH * .78, bodyH = split ? h : h - titleH * .78;
  const pad = Math.max(20 * scale, bodyH * .17), logoSize = logo ? Math.min(bodyH * .68 * design.logoScale, w * .17) : 0;
  const logoSpace = logo ? logoSize + pad * .8 : 0;
  const left = x + titleArea + pad + (design.logoPosition === "left" ? logoSpace : 0);
  const textW = Math.max(w * .2, w - titleArea - pad * 2 - logoSpace);
  const amount = animation === "none" ? 1 : clamp(progress);
  const visible = phase === "enter" ? ease(amount) : 1 - ease(amount);
  if (visible <= 0) return;
  ctx.save();
  if (["fade", "zoom", "spring"].includes(animation)) ctx.globalAlpha *= visible;
  if (animation === "slide-left") ctx.translate((phase === "enter" ? 1 - ease(amount) : -ease(amount)) * width, 0);
  if (animation === "slide-right") ctx.translate((phase === "enter" ? ease(amount) - 1 : ease(amount)) * width, 0);
  if (animation === "slide-up" || animation === "slide-down") ctx.translate(0, (phase === "enter" ? 1 - ease(amount) : -ease(amount)) * h * (animation === "slide-down" ? -1 : 1));
  if (animation === "zoom" || animation === "spring") {
    const spring = 1 + 2.7 * Math.pow(amount - 1, 3) + 1.7 * Math.pow(amount - 1, 2);
    const zoom = animation === "spring" && phase === "enter" ? .84 + spring * .16 : .84 + visible * .16;
    ctx.translate(x + w / 2, y + h / 2); ctx.scale(zoom, zoom); ctx.translate(-x - w / 2, -y - h / 2);
  }
  if (animation === "wipe") { ctx.beginPath(); ctx.rect(x - pad, y - pad, (w + pad * 2) * visible, h + pad * 2); ctx.clip(); }
  const layer = (delay: number, draw: () => void) => {
    const reveal = animation === "reveal" ? phase === "enter" ? ease((amount - delay) / (1 - delay)) : 1 - ease(amount / (1 - delay)) : 1;
    if (reveal <= 0) return;
    ctx.save();
    if (animation === "reveal") { ctx.globalAlpha *= reveal; ctx.beginPath(); ctx.rect(x - pad, y - pad, (w + 2 * pad) * reveal, h + 2 * pad); ctx.clip(); ctx.translate((1 - reveal) * -20 * scale, 0); }
    draw(); ctx.restore();
  };
  layer(.12, () => {
    ctx.save(); ctx.shadowColor = "rgba(0,0,0,.38)"; ctx.shadowBlur = design.shadow * scale; ctx.shadowOffsetY = 8 * scale;
    shapePath(ctx, x, bodyY, w, bodyH, design.shape); ctx.globalAlpha *= design.content.opacity;
    const gradient = ctx.createLinearGradient(x, bodyY, x + w, bodyY + bodyH); gradient.addColorStop(0, design.content.background); gradient.addColorStop(1, design.gradientEnd); ctx.fillStyle = gradient; ctx.fill(); ctx.restore();
    ctx.save(); shapePath(ctx, x, bodyY, w, bodyH, design.shape); ctx.clip();
    if (background) background(ctx, x, bodyY, w, bodyH);
    // Quiet geometric facets stay behind text and use no perpetual animation.
    ctx.globalAlpha *= .08; ctx.fillStyle = design.accent;
    ctx.beginPath(); ctx.moveTo(x + w * .74, bodyY); ctx.lineTo(x + w, bodyY); ctx.lineTo(x + w, bodyY + bodyH); ctx.lineTo(x + w * .86, bodyY + bodyH); ctx.closePath(); ctx.fill();
    ctx.globalAlpha /= .08; ctx.strokeStyle = design.accent; ctx.lineWidth = 3 * scale; ctx.beginPath(); ctx.moveTo(x + pad, bodyY + bodyH - 2 * scale); ctx.lineTo(x + w - pad, bodyY + bodyH - 2 * scale); ctx.stroke(); ctx.restore();
    if (design.layout === "rail") { ctx.save(); shapePath(ctx, x, bodyY, w, bodyH, design.shape); ctx.clip(); ctx.fillStyle = design.accent; ctx.fillRect(x, bodyY, Math.max(8 * scale, w * .013), bodyH); ctx.restore(); }
    if (design.layout === "outlined") { ctx.save(); ctx.strokeStyle = design.accent; ctx.lineWidth = 1.5 * scale; ctx.strokeRect(x + 10 * scale, bodyY + 10 * scale, w - 20 * scale, bodyH - 20 * scale); ctx.restore(); }
    if (design.borderWidth) { ctx.save(); shapePath(ctx, x, bodyY, w, bodyH, design.shape); ctx.strokeStyle = design.accent; ctx.globalAlpha *= .45; ctx.lineWidth = design.borderWidth * scale; ctx.stroke(); ctx.restore(); }
    if (showText) drawText(ctx, text, design.content, left, bodyY + pad * .45, textW, bodyH - pad * .9, scale);
  });
  if (title) layer(0, () => {
    const titleW = split ? titleArea - pad * .6 : Math.min(textW, Math.max(textW * .35, title.length * design.title.fontSize * scale * .64 + pad * 1.8));
    const titleX = split ? x + pad * .3 : design.title.align === "center" ? left + (textW - titleW) / 2 : design.title.align === "right" ? left + textW - titleW : left;
    ctx.save(); ctx.globalAlpha *= design.title.opacity; shapePath(ctx, titleX, y, titleW, titleH, design.shape); ctx.fillStyle = design.title.background; ctx.fill(); ctx.restore();
    if (showText) drawText(ctx, title, design.title, titleX + pad * .6, y + titleH * .1, titleW - pad * 1.2, titleH * .8, scale);
  });
  if (logo) layer(.06, () => {
    const logoX = design.logoPosition === "left" ? x + titleArea + pad : x + w - pad - logoSize, logoY = bodyY + (bodyH - logoSize) / 2;
    ctx.save(); ctx.beginPath(); ctx.roundRect(logoX - 7 * scale, logoY - 7 * scale, logoSize + 14 * scale, logoSize + 14 * scale, design.logoShape === "circle" ? logoSize : design.logoShape === "rounded" ? 14 * scale : 0);
    ctx.fillStyle = design.title.background; ctx.fill(); ctx.strokeStyle = design.accent; ctx.lineWidth = 2 * scale; ctx.stroke(); ctx.clip();
    const ratio = Math.min(logoSize / logo.naturalWidth, logoSize / logo.naturalHeight);
    const logoW = logo.naturalWidth * ratio, logoH = logo.naturalHeight * ratio;
    ctx.drawImage(logo, logoX + (logoSize - logoW) / 2, logoY + (logoSize - logoH) / 2, logoW, logoH); ctx.restore();
  });
  ctx.restore();
};

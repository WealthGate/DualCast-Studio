import type { LowerThirdSlide } from "./types";

export type LowerThirdTextStyle = {
  color: string; background: string; opacity: number; fontFamily: string; fontSize: number;
  bold: boolean; italic: boolean; underline: boolean; align: "left" | "center" | "right"; letterSpacing: number;
};
export type LowerThirdDesign = {
  preset: string; shape: "rounded" | "slant" | "cut-corner" | "capsule" | "rectangle";
  widthPercent: number; insetPercent: number; side: "left" | "center" | "right";
  accent: string; gradientEnd: string; borderWidth: number; shadow: number;
  title: LowerThirdTextStyle; content: LowerThirdTextStyle;
  titleHeightPercent: number; logoPosition: "left" | "right"; logoShape: "circle" | "rounded" | "square"; logoScale: number;
};
const textStyle = (color: string, background: string, fontSize: number, bold: boolean): LowerThirdTextStyle =>
  ({ color, background, fontSize, bold, opacity: 1, fontFamily: "Segoe UI", italic: false, underline: false, align: "left", letterSpacing: 0 });
export const defaultLowerThirdDesign: LowerThirdDesign = {
  preset: "broadcast", shape: "slant", widthPercent: 88, insetPercent: 4, side: "left",
  accent: "#32d8ff", gradientEnd: "#152f60", borderWidth: 1, shadow: 24,
  title: { ...textStyle("#071525", "#32d8ff", 32, true), letterSpacing: 1.5 },
  content: textStyle("#ffffff", "#091a33", 46, true), titleHeightPercent: 30,
  logoPosition: "left", logoShape: "circle", logoScale: 1
};
export const lowerThirdDesignPresets: Array<{ id: string; name: string; description: string; design: LowerThirdDesign }> = [
  { id: "broadcast", name: "Prism", description: "Cyan nameplate · angled broadcast panels", design: defaultLowerThirdDesign },
  { id: "aurora", name: "Aurora", description: "Violet gradient · soft luminous edges", design: { ...defaultLowerThirdDesign, preset: "aurora", shape: "rounded", accent: "#c9a7ff", gradientEnd: "#3d236d", shadow: 32,
    title: { ...textStyle("#f6edff", "#693cc3", 32, true), letterSpacing: 2 }, content: textStyle("#ffffff", "#211139", 46, false) } },
  { id: "editorial", name: "Editorial", description: "Warm ivory · serif headline · gold detail", design: { ...defaultLowerThirdDesign, preset: "editorial", shape: "rectangle", accent: "#b68334", gradientEnd: "#fffdf7", borderWidth: 0, logoShape: "square",
    title: { ...textStyle("#fffaf0", "#263242", 30, true), letterSpacing: 2.5 }, content: { ...textStyle("#202e3c", "#eee8da", 48, false), fontFamily: "Georgia" } } },
  { id: "glass", name: "Glassline", description: "Smoked glass · fine mint frame", design: { ...defaultLowerThirdDesign, preset: "glass", shape: "cut-corner", accent: "#7af2d5", gradientEnd: "#193d43", borderWidth: 2,
    title: { ...textStyle("#061b19", "#7af2d5", 30, true), letterSpacing: 2 }, content: { ...textStyle("#f1fffb", "#071b24", 46, false), opacity: .82 } } },
  { id: "ribbon", name: "Momentum", description: "Coral ribbon · bold geometric cut", design: { ...defaultLowerThirdDesign, preset: "ribbon", shape: "slant", widthPercent: 82, accent: "#ff765e", gradientEnd: "#532d54", logoShape: "rounded",
    title: { ...textStyle("#231225", "#ff765e", 32, true), letterSpacing: 1 }, content: textStyle("#ffffff", "#28182e", 46, true) } },
  { id: "worship", name: "Sanctuary", description: "Midnight blue · centered lyrics · gold glow", design: { ...defaultLowerThirdDesign, preset: "worship", shape: "capsule", side: "center", widthPercent: 92, accent: "#e6c582", gradientEnd: "#26334f", borderWidth: 1,
    title: { ...textStyle("#101b30", "#e6c582", 30, true), align: "center", letterSpacing: 2 }, content: { ...textStyle("#fff8e8", "#0c1528", 48, false), align: "center" } } }
];
const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
const number = (value: unknown, fallback: number, min: number, max: number) => typeof value === "number" && Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback;
const color = (value: unknown, fallback: string) => typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;
const normalizeText = (value: unknown, fallback: LowerThirdTextStyle): LowerThirdTextStyle => {
  const raw = object(value);
  return { color: color(raw.color, fallback.color), background: color(raw.background, fallback.background), opacity: number(raw.opacity, fallback.opacity, 0, 1),
    fontFamily: typeof raw.fontFamily === "string" && raw.fontFamily.trim() ? raw.fontFamily.slice(0, 100) : fallback.fontFamily,
    fontSize: number(raw.fontSize, fallback.fontSize, 16, 120), bold: typeof raw.bold === "boolean" ? raw.bold : fallback.bold,
    italic: raw.italic === true, underline: raw.underline === true, align: raw.align === "center" || raw.align === "right" || raw.align === "left" ? raw.align : fallback.align,
    letterSpacing: number(raw.letterSpacing, fallback.letterSpacing, 0, 8) };
};
export const normalizeLowerThirdDesign = (value: unknown): LowerThirdDesign => {
  const raw = object(value), base = lowerThirdDesignPresets.find(preset => preset.id === raw.preset)?.design ?? defaultLowerThirdDesign;
  return { preset: base.preset, shape: ["rounded", "slant", "cut-corner", "capsule", "rectangle"].includes(String(raw.shape)) ? raw.shape as LowerThirdDesign["shape"] : base.shape,
    widthPercent: number(raw.widthPercent, base.widthPercent, 40, 96), insetPercent: number(raw.insetPercent, base.insetPercent, 0, 15),
    side: raw.side === "center" || raw.side === "right" || raw.side === "left" ? raw.side : base.side, accent: color(raw.accent, base.accent), gradientEnd: color(raw.gradientEnd, base.gradientEnd),
    borderWidth: number(raw.borderWidth, base.borderWidth, 0, 6), shadow: number(raw.shadow, base.shadow, 0, 50),
    title: normalizeText(raw.title, base.title), content: normalizeText(raw.content, base.content), titleHeightPercent: number(raw.titleHeightPercent, base.titleHeightPercent, 20, 45),
    logoPosition: raw.logoPosition === "right" || raw.logoPosition === "left" ? raw.logoPosition : base.logoPosition, logoShape: raw.logoShape === "square" || raw.logoShape === "rounded" || raw.logoShape === "circle" ? raw.logoShape : base.logoShape, logoScale: number(raw.logoScale, base.logoScale, .5, 1.3) };
};
export const lowerThirdTitle = (slide: LowerThirdSlide) => slide.title ?? (slide.kind === "scripture" ? slide.reference ?? "Scripture" : slide.kind === "song" ? slide.deckTitle ?? "" : "");

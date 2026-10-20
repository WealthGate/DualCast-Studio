import { SanctuaryDisplaySettings } from "./types";

export const defaultSanctuaryDisplay: SanctuaryDisplaySettings = {
  mode: "program", backgroundType: "color", backgroundColor: "#101722",
  backgroundUrl: "", backgroundFit: "cover", backgroundDim: 0.3,
  textSource: "program", customText: "", fontFamily: "Segoe UI", fontSize: 72,
  textColor: "#ffffff", bold: true, italic: false, textAlign: "center",
  verticalAlign: "center", textRect: { x: 5, y: 10, width: 90, height: 80 }
};
const number = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === "number" && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback;
const string = (value: unknown, fallback: string, limit = 2000) => typeof value === "string" ? value.slice(0, limit) : fallback;

export const normalizeSanctuaryDisplay = (raw: unknown = {}): SanctuaryDisplaySettings => {
  const value = raw && typeof raw === "object" ? raw as Partial<SanctuaryDisplaySettings> : {};
  const d = defaultSanctuaryDisplay;
  const x = number(value.textRect?.x, d.textRect.x, 0, 95);
  const y = number(value.textRect?.y, d.textRect.y, 0, 95);
  return {
    mode: value.mode === "independent" ? "independent" : "program",
    backgroundType: value.backgroundType === "video" || value.backgroundType === "image" ? value.backgroundType : "color",
    backgroundColor: string(value.backgroundColor, d.backgroundColor, 64),
    backgroundUrl: string(value.backgroundUrl, d.backgroundUrl, 10000),
    backgroundFit: value.backgroundFit === "contain" ? "contain" : "cover",
    backgroundDim: number(value.backgroundDim, d.backgroundDim, 0, 1),
    textSource: value.textSource === "custom" ? "custom" : "program",
    customText: string(value.customText, "", 30000),
    fontFamily: string(value.fontFamily, d.fontFamily, 150), fontSize: number(value.fontSize, d.fontSize, 12, 240),
    textColor: string(value.textColor, d.textColor, 64), bold: value.bold !== false, italic: value.italic === true,
    textAlign: value.textAlign === "left" || value.textAlign === "right" ? value.textAlign : "center",
    verticalAlign: value.verticalAlign === "top" || value.verticalAlign === "bottom" ? value.verticalAlign : "center",
    textRect: { x, y, width: number(value.textRect?.width, d.textRect.width, 5, 100 - x), height: number(value.textRect?.height, d.textRect.height, 5, 100 - y) }
  };
};

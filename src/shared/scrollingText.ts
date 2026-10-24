import { ScrollingTextData } from "./types";

export const defaultScrollingText: ScrollingTextData = {
  text: "Welcome! Thank you for joining us today.", fontSize: 48, fontFamily: "Segoe UI", bold: true, italic: false,
  textColor: "#ffffff", backgroundColor: "#101722", backgroundOpacity: 0.9, backgroundImageUrl: "", backgroundFit: "cover",
  direction: "left", speed: 100, gap: 100, padding: 16, loop: true, align: "center",
  logoUrl: "", logoPosition: "left", logoWidthPercent: 12
};

export const normalizeScrollingText = (value: unknown): ScrollingTextData => {
  const data = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const number = (key: keyof ScrollingTextData, min: number, max: number) => {
    const value = Number(data[key]);
    return Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : defaultScrollingText[key] as number;
  };
  const string = (key: keyof ScrollingTextData, length: number) => typeof data[key] === "string" ? (data[key] as string).slice(0, length) : defaultScrollingText[key] as string;
  return {
    text: string("text", 20_000), fontSize: number("fontSize", 8, 400), fontFamily: string("fontFamily", 100),
    bold: typeof data.bold === "boolean" ? data.bold : defaultScrollingText.bold, italic: data.italic === true,
    textColor: string("textColor", 64), backgroundColor: string("backgroundColor", 64), backgroundOpacity: number("backgroundOpacity", 0, 1),
    backgroundImageUrl: string("backgroundImageUrl", 4096), backgroundFit: data.backgroundFit === "contain" || data.backgroundFit === "stretch" ? data.backgroundFit : "cover",
    direction: data.direction === "right" || data.direction === "up" || data.direction === "down" ? data.direction : "left",
    speed: number("speed", 0, 1000), gap: number("gap", 16, 2000), padding: number("padding", 0, 200),
    loop: data.loop !== false, align: data.align === "left" || data.align === "right" ? data.align : "center",
    logoUrl: string("logoUrl", 4096), logoPosition: data.logoPosition === "right" ? "right" : "left", logoWidthPercent: number("logoWidthPercent", 3, 40)
  };
};

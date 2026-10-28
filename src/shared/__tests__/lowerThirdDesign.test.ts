import { describe, expect, it } from "vitest";
import { lowerThirdDesignPresets, lowerThirdTitle, normalizeLowerThirdDesign } from "../lowerThirdDesign";
import verseCounts from "../bibleVerseCounts.json";
import { standardBibleBooks } from "../../renderer/utils/bibleBooks";

describe("designer lower thirds", () => {
  it("provides twelve independent bold presets with separate title/content styles", () => {
    expect(lowerThirdDesignPresets).toHaveLength(12);
    expect(new Set(lowerThirdDesignPresets.map(preset => preset.design.content.background)).size).toBe(12);
    for (const preset of lowerThirdDesignPresets) {
      expect(normalizeLowerThirdDesign(preset.design)).toEqual(preset.design);
      expect(preset.design.title).not.toBe(preset.design.content);
      expect(preset.design.title.weight).toBeGreaterThanOrEqual(800); expect(preset.design.content.weight).toBeGreaterThanOrEqual(800);
    }
  });
  it("keeps legacy emphasis choices and normalizes editable font weights", () => {
    expect(normalizeLowerThirdDesign({ content: { bold: false } }).content).toMatchObject({ bold: false, weight: 400 });
    expect(normalizeLowerThirdDesign({ title: { weight: 900 }, content: { weight: 500 } })).toMatchObject({ title: { bold: true, weight: 900 }, content: { bold: false, weight: 500 } });
  });
  it("keeps new preset text readable against both gradient endpoints", () => {
    const luminance = (color: string) => {
      const values = color.slice(1).match(/../g)!.map(value => parseInt(value, 16) / 255).map(value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
      return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
    };
    const contrast = (a: string, b: string) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
    for (const { design } of lowerThirdDesignPresets.slice(6)) {
      expect(contrast(design.title.color, design.title.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(design.content.color, design.content.background)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(design.content.color, design.gradientEnd)).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("normalizes imported settings and bounds geometry, fonts, opacity and colors", () => {
    const design = normalizeLowerThirdDesign({ preset: "worship", shape: "injected", widthPercent: 900, title: { color: "javascript:bad", fontSize: -1, opacity: NaN }, content: { fontSize: Infinity, letterSpacing: 500 } });
    expect(design).toMatchObject({ side: "center", shape: "capsule", widthPercent: 96, title: { color: "#101b30", fontSize: 16, opacity: 1 }, content: { fontSize: 48, letterSpacing: 8 } });
    expect(design.content.align).toBe("center");
  });
  it("uses explicit titles, Scripture references and song titles without rewriting content", () => {
    expect(lowerThirdTitle({ id: "x", text: "Body", title: "Title" })).toBe("Title");
    expect(lowerThirdTitle({ id: "x", text: "Lyrics", kind: "song", deckTitle: "Amazing Grace" })).toBe("Amazing Grace");
    expect(lowerThirdTitle({ id: "x", text: "Verse", kind: "scripture", reference: "John 3:16" })).toBe("John 3:16");
    expect(lowerThirdTitle({ id: "x", text: "Lyrics", kind: "song", deckTitle: "Song", title: "" })).toBe("");
    expect(lowerThirdTitle({ id: "x", text: "Legacy card" })).toBe("");
  });
});
describe("chapter verse counts", () => {
  it("covers the standard 66 books and 1189 chapters, including short and long chapters", () => {
    for (const [book, chapters] of standardBibleBooks) expect((verseCounts as Record<string, number[]>)[book]).toHaveLength(chapters);
    expect(Object.values(verseCounts).flat()).toHaveLength(1189);
    expect(Object.values(verseCounts).flat().reduce((a, b) => a + b, 0)).toBe(31102);
    expect(verseCounts.John[2]).toBe(36); expect(verseCounts.Psalms[118]).toBe(176);
  });
});

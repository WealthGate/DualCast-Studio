import { describe, expect, it } from "vitest";
import { lowerThirdDesignPresets, lowerThirdTitle, normalizeLowerThirdDesign } from "../lowerThirdDesign";
import verseCounts from "../bibleVerseCounts.json";
import { standardBibleBooks } from "../../renderer/utils/bibleBooks";

describe("designer lower thirds", () => {
  it("provides six independent presets with separate title/content styles", () => {
    expect(lowerThirdDesignPresets).toHaveLength(6);
    expect(new Set(lowerThirdDesignPresets.map(preset => preset.design.content.background)).size).toBe(6);
    for (const preset of lowerThirdDesignPresets) {
      expect(normalizeLowerThirdDesign(preset.design)).toEqual(preset.design);
      expect(preset.design.title).not.toBe(preset.design.content);
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

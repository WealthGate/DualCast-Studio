import { describe, expect, it } from "vitest";
import { normalizeScriptureLibrary } from "../../../electron/services/scriptureService";

describe("Scripture library normalization", () => {
  it("imports reference/text passage collections", () => {
    const library = normalizeScriptureLibrary({
      name: "Test Bible",
      translation: "TEST",
      passages: [
        { reference: "John 3:16", text: "For God so loved the world." },
        { reference: "John 3:17", text: "For God did not send his Son." }
      ]
    }, "Fallback");

    expect(library.name).toBe("Test Bible");
    expect(library.translation).toBe("TEST");
    expect(library.passages).toHaveLength(2);
  });

  it("imports book/chapter/verse array collections", () => {
    const library = normalizeScriptureLibrary({
      books: [{ name: "Genesis", chapters: [["In the beginning", "The earth was without form"]] }]
    }, "Imported Bible");

    expect(library.passages).toEqual([
      { reference: "Genesis 1:1", text: "In the beginning" },
      { reference: "Genesis 1:2", text: "The earth was without form" }
    ]);
  });

  it("preserves verse numbers from keyed chapter objects", () => {
    const library = normalizeScriptureLibrary({
      books: [{ name: "John", chapters: { "3": { "16": "For God so loved the world." } } }]
    }, "Imported Bible");

    expect(library.passages).toEqual([
      { reference: "John 3:16", text: "For God so loved the world." }
    ]);
  });

  it("preserves per-passage translation metadata", () => {
    const library = normalizeScriptureLibrary({
      passages: [{ reference: "Psalm 23:1", text: "The Lord is my shepherd.", translation: "KJV" }]
    }, "Imported Bible");

    expect(library.passages[0].translation).toBe("KJV");
  });

  it("rejects JSON without Scripture passages", () => {
    expect(() => normalizeScriptureLibrary({ name: "Empty" }, "Fallback")).toThrow("No Scripture passages were found");
  });

  it("removes markup and stray wrapping characters from imported verses", () => {
    const library = normalizeScriptureLibrary({
      passages: [{ reference: "John 3:16", text: "<For <span>God</span> so loved the world.>" }]
    }, "Imported Bible");

    expect(library.passages[0].text).toBe("For God so loved the world.");
  });
});

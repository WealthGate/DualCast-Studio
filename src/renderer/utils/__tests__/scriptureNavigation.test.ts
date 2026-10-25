import { describe, expect, it } from "vitest";
import { adjacentScriptureVerse, scriptureVerseOptions } from "../scriptureNavigation";

describe("Scripture verse navigation", () => {
  it("offers chapter-specific online verses and exact sparse offline verse lists", () => {
    expect(scriptureVerseOptions("John", 3)).toHaveLength(36);
    expect(scriptureVerseOptions("Psalms", 119)).toHaveLength(176);
    expect(scriptureVerseOptions("John", 3, [7, 1, 3, 3, -1])).toEqual([1, 3, 7]);
    expect(scriptureVerseOptions("John", 3, [])).toEqual([]);
  });
  it("moves past a selected passage in either direction", () => {
    expect(adjacentScriptureVerse([15, 16, 17, 18, 19], 16, 18, 1)).toBe(19);
    expect(adjacentScriptureVerse([15, 16, 17, 18, 19], 16, 18, -1)).toBe(15);
  });
  it("skips missing offline verses", () => {
    expect(adjacentScriptureVerse([1, 3, 7], 3, 3, 1)).toBe(7);
    expect(adjacentScriptureVerse([7, 3, 1], 7, 7, -1)).toBe(3);
  });
  it("stops at chapter boundaries and handles an empty chapter", () => {
    expect(adjacentScriptureVerse([1, 2], 1, 1, -1)).toBeNull();
    expect(adjacentScriptureVerse([1, 2], 2, 2, 1)).toBeNull();
    expect(adjacentScriptureVerse([], 1, 1, 1)).toBeNull();
  });
});

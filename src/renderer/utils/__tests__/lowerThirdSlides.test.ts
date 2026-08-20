import { describe, expect, it } from "vitest";
import { insertSlideAfter, replaceSlideWithLines, splitSlideLines } from "../lowerThirdSlides";

const slides = [
  { id: "one", text: "First", kind: "song" as const },
  { id: "two", text: "Second", kind: "song" as const }
];

describe("lower-third slide editing", () => {
  it("inserts a new slide immediately after the edited slide", () => {
    expect(insertSlideAfter(slides, "one", { id: "new", text: "New", kind: "song" }))
      .toEqual([slides[0], { id: "new", text: "New", kind: "song" }, slides[1]]);
  });

  it("turns every non-empty edited line into an ordered slide", () => {
    const ids = ["line-two", "line-three"];
    const result = replaceSlideWithLines(slides, "one", "Verse one\n\nVerse two\nVerse three", () => ids.shift()!);

    expect(result?.slides.map((slide) => [slide.id, slide.text])).toEqual([
      ["one", "Verse one"],
      ["line-two", "Verse two"],
      ["line-three", "Verse three"],
      ["two", "Second"]
    ]);
    expect(result?.activeSlideId).toBe("one");
  });

  it("ignores blank lines when splitting edited text", () => {
    expect(splitSlideLines("Line one\n  \nLine two")).toEqual(["Line one", "Line two"]);
  });
});

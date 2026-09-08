import { describe, expect, it } from "vitest";
import { createScriptureSlides, splitTextIntoSlides } from "../presentationSlides";

describe("presentation slide creation", () => {
  it("groups created display lines by the selected line count", () => {
    expect(splitTextIntoSlides("Line one\nLine two\nLine three", { linesPerSlide: 2 })).toEqual([
      "Line one\nLine two",
      "Line three"
    ]);
  });

  it("wraps long pasted lines before creating slides", () => {
    expect(splitTextIntoSlides("one two three four five", { linesPerSlide: 1, maxCharactersPerLine: 18 }))
      .toEqual(["one two three four", "five"]);
  });

  it("creates one referenced Scripture slide per returned verse", () => {
    let id = 0;
    const slides = createScriptureSlides({
      reference: "John 3:16-17",
      text: "For God so loved. For God sent not.",
      verses: [
        { reference: "John 3:16", text: "For God so loved." },
        { reference: "John 3:17", text: "For God sent not." }
      ]
    }, { mode: "verse", linesPerSlide: 2, deckId: "deck", deckTitle: "John 3:16-17", createId: () => `id-${++id}` });
    expect(slides.map((slide) => [slide.reference, slide.text, slide.deckId])).toEqual([
      ["John 3:16", "For God so loved.", "deck"],
      ["John 3:17", "For God sent not.", "deck"]
    ]);
  });
});

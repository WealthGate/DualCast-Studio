import { LowerThirdSlide, ScriptureFetchResult } from "../../shared/types";

export type TextSlideOptions = {
  linesPerSlide: number;
  maxCharactersPerLine?: number;
};

const wrapLine = (line: string, maxCharacters: number) => {
  const words = line.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = "";
  words.forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;
    if (current && candidate.length > maxCharacters) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  });
  if (current) lines.push(current);
  return lines;
};

export const splitTextIntoSlides = (text: string, options: TextSlideOptions) => {
  const linesPerSlide = Math.max(1, Math.min(8, Math.round(options.linesPerSlide)));
  const maxCharacters = Math.max(18, Math.min(120, Math.round(options.maxCharactersPerLine ?? 52)));
  const sections = text.trim().split(/\r?\n\s*\r?\n/g).map((section) => section.trim()).filter(Boolean);
  return sections.flatMap((section) => {
    const displayLines = section
      .split(/\r?\n/g)
      .flatMap((line) => wrapLine(line, maxCharacters));
    const slides: string[] = [];
    for (let index = 0; index < displayLines.length; index += linesPerSlide) {
      slides.push(displayLines.slice(index, index + linesPerSlide).join("\n"));
    }
    return slides;
  });
};

type ScriptureSlideOptions = {
  mode: "passage" | "verse" | "lines";
  linesPerSlide: number;
  deckId: string;
  deckTitle: string;
  createId: () => string;
};

export const createScriptureSlides = (
  result: ScriptureFetchResult,
  options: ScriptureSlideOptions
): LowerThirdSlide[] => {
  if (options.mode === "verse" && result.verses?.length) {
    return result.verses
      .filter((verse) => verse.text.trim())
      .map((verse) => ({
        id: options.createId(),
        text: verse.text.trim(),
        reference: verse.reference.trim() || result.reference,
        kind: "scripture",
        deckId: options.deckId,
        deckTitle: options.deckTitle
      }));
  }
  const texts = options.mode === "passage"
    ? [result.text.trim()]
    : splitTextIntoSlides(result.text, { linesPerSlide: options.linesPerSlide });
  return texts.filter(Boolean).map((text, index) => ({
    id: options.createId(),
    text,
    reference: texts.length > 1 ? `${result.reference} (${index + 1}/${texts.length})` : result.reference,
    kind: "scripture",
    deckId: options.deckId,
    deckTitle: options.deckTitle
  }));
};

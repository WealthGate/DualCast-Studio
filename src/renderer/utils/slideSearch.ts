import type { LowerThirdSlide } from "../../shared/types";

export const searchWords = (query: string) => query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);

export const matchesSearch = (words: readonly string[], ...fields: Array<string | undefined>) => {
  const content = fields.filter(Boolean).join(" ").toLocaleLowerCase();
  return words.every(word => content.includes(word));
};

export const matchesSlide = (slide: LowerThirdSlide, words: readonly string[]) =>
  matchesSearch(words, slide.title, slide.deckTitle, slide.reference, slide.text);

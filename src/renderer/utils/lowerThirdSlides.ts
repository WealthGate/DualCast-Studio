import { LowerThirdSlide } from "../../shared/types";

export const splitSlideLines = (text: string) => text
  .split(/\r?\n/g)
  .map((line) => line.trim())
  .filter(Boolean);

export const insertSlideAfter = (
  slides: LowerThirdSlide[],
  afterSlideId: string | null,
  slide: LowerThirdSlide
) => {
  const afterIndex = afterSlideId
    ? slides.findIndex((candidate) => candidate.id === afterSlideId)
    : slides.length - 1;
  const insertionIndex = afterIndex < 0 ? slides.length : afterIndex + 1;
  return [...slides.slice(0, insertionIndex), slide, ...slides.slice(insertionIndex)];
};

export const replaceSlideWithLines = (
  slides: LowerThirdSlide[],
  slideId: string,
  text: string,
  createId: () => string
) => {
  const index = slides.findIndex((slide) => slide.id === slideId);
  const original = slides[index];
  const lines = splitSlideLines(text);
  if (!original || lines.length < 2) {
    return null;
  }
  const replacements = lines.map<LowerThirdSlide>((line, lineIndex) => ({
    ...original,
    id: lineIndex === 0 ? original.id : createId(),
    text: line
  }));
  return {
    slides: [...slides.slice(0, index), ...replacements, ...slides.slice(index + 1)],
    activeSlideId: replacements[0].id
  };
};

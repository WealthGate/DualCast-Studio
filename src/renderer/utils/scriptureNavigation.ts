import verseCounts from "../../shared/bibleVerseCounts.json";

/** Move beyond the current selection, respecting gaps in offline libraries. */
export const adjacentScriptureVerse = (verses: number[], start: number, end: number, direction: -1 | 1): number | null => {
  const ordered = [...verses].sort((a, b) => a - b);
  return direction === 1
    ? ordered.find(verse => verse > end) ?? null
    : ordered.reverse().find(verse => verse < start) ?? null;
};

/** Offline libraries define their own available numbers; online uses KJV versification. */
export const scriptureVerseOptions = (book: string, chapter: number, offline?: number[]) => {
  if (offline) return [...new Set(offline.filter(verse => Number.isInteger(verse) && verse > 0))].sort((a, b) => a - b);
  const count = (verseCounts as Record<string, number[]>)[book]?.[chapter - 1] ?? 176;
  return Array.from({ length: count }, (_, index) => index + 1);
};

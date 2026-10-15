/** Move beyond the current selection, respecting gaps in offline libraries. */
export const adjacentScriptureVerse = (verses: number[], start: number, end: number, direction: -1 | 1): number | null => {
  const ordered = [...verses].sort((a, b) => a - b);
  return direction === 1
    ? ordered.find(verse => verse > end) ?? null
    : ordered.reverse().find(verse => verse < start) ?? null;
};

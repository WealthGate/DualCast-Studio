import type { LowerThirdSlide, ServiceSchedule, ServiceScheduleItem } from "./types";
import { normalizeStudioState } from "./settings";
import { sanitizeScriptureText } from "./scriptureText";

const object = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
const text = (value: unknown, limit = 500) => typeof value === "string" ? value.slice(0, limit) : "";
export const normalizeServiceSchedules = (value: unknown): ServiceSchedule[] => {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.slice(0, 100).flatMap(raw => {
    const schedule = object(raw), id = text(schedule.id);
    if (!id || seen.has(id)) return [];
    seen.add(id);
    const itemIds = new Set<string>();
    const items = (Array.isArray(schedule.items) ? schedule.items : []).slice(0, 500).flatMap<ServiceScheduleItem>(rawItem => {
      const item = object(rawItem), itemId = text(item.id);
      if (!itemId || itemIds.has(itemId)) return [];
      itemIds.add(itemId);
      const base = { id: itemId, title: text(item.title) || "Untitled item", notes: text(item.notes, 10000), minutes: Math.max(0, Math.min(600, Number(item.minutes) || 0)) };
      if (item.kind === "note") return [{ ...base, kind: "note" }];
      if (item.kind === "slides") {
        const slides: LowerThirdSlide[] = (Array.isArray(item.slides) ? item.slides : []).slice(0, 500).flatMap(rawSlide => {
          const slide = object(rawSlide), content = text(slide.text, 100000);
          if (!content.trim()) return [];
          return [{ id: text(slide.id) || `slide-${Math.random().toString(36).slice(2)}`, text: slide.kind === "scripture" ? sanitizeScriptureText(content) : content,
            title: typeof slide.title === "string" ? (slide.kind === "scripture" ? sanitizeScriptureText(slide.title) : slide.title).slice(0, 500) : undefined,
            deckTitle: text(slide.deckTitle, 300) || undefined, deckId: text(slide.deckId, 200) || undefined,
            reference: text(slide.reference), kind: ["text", "song", "scripture"].includes(String(slide.kind)) ? slide.kind as LowerThirdSlide["kind"] : "text" }];
        });
        return slides.length ? [{ ...base, kind: "slides", slides }] : [];
      }
      if (item.kind === "scene" && typeof object(item.scene).id === "string") {
        const studio = normalizeStudioState({ scenes: [item.scene], sources: item.sources, groups: [], previewSceneId: object(item.scene).id, programSceneId: null });
        const scene = studio.scenes[0];
        return scene ? [{ ...base, kind: "scene", scene, sources: studio.sources }] : [];
      }
      return [];
    });
    return [{ id, name: text(schedule.name) || "Untitled service", date: text(schedule.date, 10), items }];
  });
};

export const adjacentScheduleCue = (items: ServiceScheduleItem[], index: number, slide: number, direction: -1 | 1) => {
  if (!items.length) return null;
  if (index < 0) return { index: 0, slide: 0 };
  const item = items[index];
  if (item?.kind === "slides" && slide + direction >= 0 && slide + direction < item.slides.length) return { index, slide: slide + direction };
  const next = index + direction;
  if (next < 0 || next >= items.length) return null;
  const target = items[next];
  return { index: next, slide: direction < 0 && target.kind === "slides" ? target.slides.length - 1 : 0 };
};

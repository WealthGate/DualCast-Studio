import type { LowerThirdSlide, Scene, ServiceScheduleItem, Source } from "../../shared/types";
import { normalizeServiceSchedules } from "../../shared/serviceSchedules";
import { useAppStore } from "../store/useAppStore";

export type ScheduleItemDraft = { kind: "slides"; title: string; slides: LowerThirdSlide[] }
  | { kind: "scene"; title: string; scene: Scene; sources: Record<string, Source> };
let writeQueue = Promise.resolve();

export const addItemToSchedule = (draft: ScheduleItemDraft, scheduleId: string | null) => {
  const snapshot = structuredClone(draft);
  const result = writeQueue.then(async () => {
    const state = useAppStore.getState();
    const schedules = normalizeServiceSchedules(state.settings.serviceSchedules);
    let schedule = schedules.find(item => item.id === (scheduleId || state.activeScheduleId));
    if (scheduleId && !schedule) throw Error("The selected service no longer exists. Choose another schedule.");
    if (!schedule) {
      if (schedules.length >= 100) throw Error("The schedule library is full. Choose an existing service.");
      schedule = { id: crypto.randomUUID(), name: "New service", date: "", items: [] };
      schedules.push(schedule);
    }
    if (schedule.items.length >= 500) throw Error("A service can contain up to 500 items.");
    if (snapshot.kind === "slides" && (!snapshot.slides.length || snapshot.slides.some(slide => !slide.text.trim()))) throw Error("Enter content before adding it to the schedule.");
    if (snapshot.kind === "slides" && snapshot.slides.length > 500) throw Error("A scheduled presentation can contain up to 500 slides. Split it into smaller presentations.");
    const item: ServiceScheduleItem = { ...snapshot, id: crypto.randomUUID(), notes: "", minutes: 0 };
    const normalized = normalizeServiceSchedules([{ ...schedule, items: [...schedule.items, item] }])[0];
    if (!normalized || normalized.items.length !== schedule.items.length + 1) throw Error("This item could not be saved in the schedule.");
    await state.updateSettings({ serviceSchedules: schedules.map(service => service.id === schedule.id ? normalized : service) });
    useAppStore.setState({ activeScheduleId: schedule.id });
    return { scheduleName: schedule.name, itemId: item.id };
  });
  writeQueue = result.then(() => undefined, () => undefined);
  return result;
};

export const sceneScheduleDraft = (scene: Scene, sources: Record<string, Source>): ScheduleItemDraft => ({
  kind: "scene", title: scene.name, scene: structuredClone(scene),
  sources: structuredClone(Object.fromEntries(scene.sourceIds.filter(id => sources[id]).map(id => [id, sources[id]])))
});

export const sourceScheduleDraft = (source: Source): ScheduleItemDraft => source.type === "text"
  ? { kind: "slides", title: source.name, slides: [{ id: crypto.randomUUID(), kind: "text", text: source.data.text }] }
  : sceneScheduleDraft({ id: `source:${source.id}`, name: source.name, sourceIds: [source.id] }, { [source.id]: source });

export const reorderScheduleItems = (items: ServiceScheduleItem[], draggedId: string, targetId: string) => {
  const from = items.findIndex(item => item.id === draggedId), to = items.findIndex(item => item.id === targetId);
  if (from < 0 || to < 0 || from === to) return items;
  const next = [...items]; const [moved] = next.splice(from, 1); next.splice(to, 0, moved); return next;
};

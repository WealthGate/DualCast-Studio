import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addItemToSchedule, reorderScheduleItems, sceneScheduleDraft } from "../serviceScheduleActions";
import { playScheduleItem } from "../playScheduleItem";
import { useAppStore } from "../../store/useAppStore";
import type { ServiceScheduleItem, SettingsUpdate } from "../../../shared/types";
import { defaultSanctuaryDisplay } from "../../../shared/sanctuaryDisplay";
import { getSanctuaryDisplayState } from "../sanctuaryContent";

const initial = useAppStore.getState();
const hymn: ServiceScheduleItem = { id: "hymn", kind: "slides", title: "Amazing Grace", minutes: 0, notes: "", slides: [
  { id: "one", text: "Amazing grace", kind: "song" }, { id: "two", text: "How sweet the sound", kind: "song" }
] };
beforeEach(() => {
  useAppStore.setState({ ...initial, settings: { ...initial.settings, serviceSchedules: [], lowerThird: { ...initial.settings.lowerThird, slides: [], activeSlideId: null, programSlideId: null } } });
  vi.stubGlobal("window", { dualcast: { updateSettings: vi.fn(async (update: SettingsUpdate) => ({ ...useAppStore.getState().settings, ...update })) } });
});
afterEach(() => { vi.unstubAllGlobals(); useAppStore.setState(initial); });
describe("adding and ordering service items", () => {
  it("creates a service and copies typed slides without changing live output", async () => {
    const before = useAppStore.getState().programRevision;
    await addItemToSchedule(hymn, null);
    const service = useAppStore.getState().settings.serviceSchedules![0];
    expect(service.items[0]).toMatchObject({ title: "Amazing Grace", slides: [{ text: "Amazing grace" }, { text: "How sweet the sound" }] });
    expect(useAppStore.getState().programRevision).toBe(before);
    expect(useAppStore.getState().settings.lowerThird.slides).toHaveLength(0);
    expect(useAppStore.getState().activeScheduleId).toBe(service.id);
    expect(service.items[0]).not.toBe(hymn);
  });
  it("retains concurrent additions and recovers after a failed save", async () => {
    const [a, b] = await Promise.all([addItemToSchedule(hymn, null), addItemToSchedule({ ...hymn, title: "Second song" }, null)]);
    expect(a.itemId).not.toBe(b.itemId);
    expect(useAppStore.getState().settings.serviceSchedules).toHaveLength(1);
    expect(useAppStore.getState().settings.serviceSchedules![0].items).toHaveLength(2);
    vi.mocked(window.dualcast.updateSettings).mockRejectedValueOnce(Error("Disk full"));
    await expect(addItemToSchedule(hymn, useAppStore.getState().activeScheduleId)).rejects.toThrow("Disk full");
    await addItemToSchedule({ ...hymn, title: "Retry" }, useAppStore.getState().activeScheduleId);
    expect(useAppStore.getState().settings.serviceSchedules![0].items).toHaveLength(3);
  });
  it("does not silently replace a deleted destination service", async () => {
    await expect(addItemToSchedule(hymn, "deleted-service")).rejects.toThrow("no longer exists");
    expect(useAppStore.getState().settings.serviceSchedules).toEqual([]);
  });
  it("reorders in both directions without changing the saved content", () => {
    const items = [hymn, { ...hymn, id: "b" }, { ...hymn, id: "c" }];
    expect(reorderScheduleItems(items, "hymn", "c").map(item => item.id)).toEqual(["b", "c", "hymn"]);
    expect(reorderScheduleItems(items, "c", "hymn").map(item => item.id)).toEqual(["c", "hymn", "b"]);
    expect(reorderScheduleItems(items, "foreign", "hymn")).toBe(items);
    expect(items.map(item => item.id)).toEqual(["hymn", "b", "c"]);
  });
});
describe("schedule playback", () => {
  it("starts songs on the first slide, supports navigation, and restarts on another click", async () => {
    useAppStore.setState({ isFrozen: true, isCutToBlack: true, isLowerThirdHidden: true, manualBlend: .5, displayTextMode: "text-only" });
    await playScheduleItem("sunday", hymn);
    let state = useAppStore.getState();
    expect(state.settings.lowerThird.activeSlideId).toBe("service:sunday:hymn:0");
    expect(state.settings.lowerThird.programSlideId).toBe("service:sunday:hymn:0");
    expect(state).toMatchObject({ isFrozen: false, isCutToBlack: false, isLowerThirdHidden: false, manualBlend: 0, displayTextMode: "text-only" });
    await playScheduleItem("sunday", hymn, 1);
    await playScheduleItem("sunday", hymn);
    state = useAppStore.getState(); expect(state.settings.lowerThird.programSlideId).toBe("service:sunday:hymn:0");
    expect(state.settings.lowerThird.slides).toHaveLength(2);
  });
  it("cues sanitized Scripture and publishes its location to the Scripture panel", async () => {
    useAppStore.setState({ settings: { ...useAppStore.getState().settings, sanctuaryDisplay: { ...defaultSanctuaryDisplay, mode: "independent", textSource: "custom", customText: "Old service" } } });
    await playScheduleItem("sunday", { ...hymn, id: "reading", title: "Reading", slides: [{ id: "verse", text: "<b>God is love</b>", reference: "&lt;John 3:16&gt;", kind: "scripture" }] });
    expect(useAppStore.getState().scriptureCueRequest).toMatchObject({ reference: "John 3:16", text: "God is love" });
    expect(useAppStore.getState().settings.lowerThird.slides[0]).toMatchObject({ reference: "John 3:16", text: "God is love" });
    expect(getSanctuaryDisplayState(useAppStore.getState())).toMatchObject({ text: "God is love", settings: { mode: "independent", textSource: "program" } });
  });
  it("restores an independent scene snapshot with Preview and Program in agreement", async () => {
    const state = useAppStore.getState();
    const draft = sceneScheduleDraft(state.scenes[0], state.sources);
    if (draft.kind !== "scene") throw Error("scene fixture missing");
    await playScheduleItem("sunday", { ...draft, id: "scene", minutes: 0, notes: "" });
    const next = useAppStore.getState();
    expect(next.previewSceneId).toBe(next.programSceneId);
    expect(next.programSceneId).toBe("service:sunday:scene:scene");
    expect(draft.scene.id).not.toBe(next.programSceneId);
  });
  it("keeps operator notes private and rejects invalid slides without changing output", async () => {
    const before = useAppStore.getState();
    await playScheduleItem("sunday", { id: "note", kind: "note", title: "Prayer", minutes: 0, notes: "Private" });
    await expect(playScheduleItem("sunday", hymn, -1)).rejects.toThrow("no longer available");
    expect(useAppStore.getState()).toBe(before);
  });
  it("clears both presentation buses while retaining saved services and source media", async () => {
    await addItemToSchedule(hymn, null); await playScheduleItem("sunday", hymn);
    const before = useAppStore.getState();
    await before.clearLowerThirdSlides();
    const after = useAppStore.getState();
    expect(after.settings.lowerThird).toMatchObject({ slides: [], activeSlideId: null, programSlideId: null });
    expect(after.settings.serviceSchedules).toEqual(before.settings.serviceSchedules);
    expect(after.sources).toBe(before.sources); expect(after.programSources).toBe(before.programSources);
    expect(after.presentationGeneration).toBe(before.presentationGeneration + 1);
    await playScheduleItem("sunday", hymn); expect(useAppStore.getState().settings.lowerThird.slides).toHaveLength(2);
  });
  it("restores the queue if clearing cannot be saved", async () => {
    await playScheduleItem("sunday", hymn);
    vi.mocked(window.dualcast.updateSettings).mockRejectedValueOnce(Error("Unable to save"));
    await expect(useAppStore.getState().clearLowerThirdSlides()).rejects.toThrow("Unable to save");
    expect(useAppStore.getState().settings.lowerThird.slides).toHaveLength(2);
    expect(useAppStore.getState().settings.lowerThird.programSlideId).toBe("service:sunday:hymn:0");
  });
  it("reports a full queue before changing live output instead of losing the scheduled slides on save", async () => {
    const state = useAppStore.getState();
    useAppStore.setState({ settings: { ...state.settings, lowerThird: { ...state.settings.lowerThird, slides: Array.from({ length: 500 }, (_, index) => ({ id: `old-${index}`, text: "Old slide" })) } }, isFrozen: true, isCutToBlack: true });
    await expect(playScheduleItem("sunday", hymn)).rejects.toThrow("Clear All Slides");
    expect(useAppStore.getState()).toMatchObject({ isFrozen: true, isCutToBlack: true });
    expect(useAppStore.getState().settings.lowerThird.slides).toHaveLength(500);
  });
});

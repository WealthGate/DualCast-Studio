import type { ServiceScheduleItem } from "../../shared/types";
import { useAppStore } from "../store/useAppStore";
import { presentationTextMode } from "../../shared/displayText";
import { sanitizeScriptureText } from "../../shared/scriptureText";
import { normalizeSanctuaryDisplay } from "../../shared/sanctuaryDisplay";

const markScheduleLive = (scheduleId: string, itemId: string, slide: number) => {
  if (!useAppStore.getState().settings.serviceSchedules?.some(service => service.id === scheduleId)) return;
  useAppStore.setState({ activeScheduleId: scheduleId, liveScheduleCue: { scheduleId, itemId, slide } });
};

export const playScheduleItem = async (scheduleId: string, item: ServiceScheduleItem, slideIndex = 0, live = true) => {
  if (item.kind === "note") return;
  const state = useAppStore.getState();
  if (item.kind === "scene") {
    const prefix = `service:${scheduleId}:${item.id}:`;
    const snapshot = structuredClone(item);
    const sources = Object.fromEntries(Object.entries(snapshot.sources).map(([id, source]) => [prefix + id, { ...source, id: prefix + id }]));
    const scene = { ...snapshot.scene, id: prefix + "scene", sourceIds: snapshot.scene.sourceIds.map(id => prefix + id) };
    useAppStore.setState({ scenes: [...state.scenes.filter(candidate => candidate.id !== scene.id), scene], sources: { ...state.sources, ...sources },
      settings: { ...state.settings, lowerThird: { ...state.settings.lowerThird, activeSlideId: null } },
      ...(live ? { isCutToBlack: false, isFrozen: false, manualBlend: 0, isLowerThirdHidden: false, displayTextMode: presentationTextMode(state.displayTextMode) } : {}) });
    useAppStore.getState().selectPreviewScene(scene.id);
    if (live) {
      useAppStore.getState().setProgramScene(scene.id);
      markScheduleLive(scheduleId, item.id, 0);
    }
    return;
  }
  const selected = Number.isInteger(slideIndex) ? item.slides[slideIndex] : null;
  if (!selected) throw Error("This schedule slide is no longer available.");
  const deckId = `service:${scheduleId}:${item.id}${live ? "" : `:preview:${crypto.randomUUID()}`}`;
  const retained = state.settings.lowerThird.slides.filter(slide =>
    !slide.id.startsWith("service:") || (slide.id === state.settings.lowerThird.programSlideId && slide.deckId !== deckId));
  if (retained.length + item.slides.length > 500) throw Error("The slide queue is full. Use Clear All Slides before opening this presentation.");
  if (live && !state.programSceneSnapshot) {
    const backgroundId = `service:${scheduleId}:background`;
    const source = { id: backgroundId, name: "Service background", type: "text" as const, enabled: true, audioEnabled: false,
      rect: { x: 0, y: 0, width: 100, height: 100 }, data: { text: "", fontSize: 48, color: "#000000", backgroundColor: "#000000", align: "center" as const } };
    const scene = { id: backgroundId, name: "Service background", sourceIds: [source.id] };
    useAppStore.setState({ scenes: [...state.scenes.filter(candidate => candidate.id !== scene.id), scene], sources: { ...state.sources, [source.id]: source } });
    useAppStore.getState().setProgramScene(scene.id);
  }
  if (live) useAppStore.setState({ isCutToBlack: false, isFrozen: false, manualBlend: 0, isLowerThirdHidden: false, displayTextMode: presentationTextMode(state.displayTextMode) });
  const current = useAppStore.getState();
  const slides = item.slides.map((slide, index) => ({ ...slide, ...(slide.kind === "scripture" ? {
    text: sanitizeScriptureText(slide.text), reference: sanitizeScriptureText(slide.reference ?? ""), title: sanitizeScriptureText(slide.title ?? "")
  } : {}), id: `${deckId}:${index}`, deckId, deckTitle: item.title }));
  await current.stageLowerThird([...retained, ...slides], slides[slideIndex].id, live);
  if (live) markScheduleLive(scheduleId, item.id, slideIndex);
  const sanctuary = normalizeSanctuaryDisplay(useAppStore.getState().settings.sanctuaryDisplay);
  if (live && sanctuary.textSource !== "program") await useAppStore.getState().updateSettings({ sanctuaryDisplay: { ...sanctuary, textSource: "program" } });
  if (selected.kind === "scripture") {
    const reference = sanitizeScriptureText(selected.reference || item.title);
    useAppStore.setState({ scriptureCueRequest: { requestId: crypto.randomUUID(), live, reference, text: slides[slideIndex].text,
      verses: [{ reference, text: slides[slideIndex].text }] } });
  }
};

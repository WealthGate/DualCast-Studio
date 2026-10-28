import type { ServiceScheduleItem } from "../../shared/types";
import { useAppStore } from "../store/useAppStore";

export const playScheduleItem = async (scheduleId: string, item: ServiceScheduleItem, slideIndex = 0) => {
  if (item.kind === "note") return;
  const state = useAppStore.getState();
  if (item.kind === "scene") {
    const prefix = `service:${scheduleId}:${item.id}:`;
    const sources = Object.fromEntries(Object.entries(item.sources).map(([id, source]) => [prefix + id, { ...source, id: prefix + id }]));
    const scene = { ...item.scene, id: prefix + "scene", sourceIds: item.scene.sourceIds.map(id => prefix + id) };
    useAppStore.setState({ scenes: [...state.scenes.filter(candidate => candidate.id !== scene.id), scene], sources: { ...state.sources, ...sources },
      settings: { ...state.settings, lowerThird: { ...state.settings.lowerThird, activeSlideId: null, programSlideId: null } },
      isCutToBlack: false, isLowerThirdHidden: false, displayTextMode: "show" });
    useAppStore.getState().selectPreviewScene(scene.id);
    useAppStore.getState().takeToProgram();
    return;
  }
  const selected = item.slides[slideIndex];
  if (!selected) throw Error("This schedule slide is no longer available.");
  if (!state.programSceneSnapshot) {
    const source = { id: "service-background", name: "Service background", type: "text" as const, enabled: true, audioEnabled: false,
      rect: { x: 0, y: 0, width: 100, height: 100 }, data: { text: "", fontSize: 48, color: "#000000", backgroundColor: "#000000", align: "center" as const } };
    const scene = { id: "service-background", name: "Service background", sourceIds: [source.id] };
    useAppStore.setState({ scenes: [...state.scenes, scene], sources: { ...state.sources, [source.id]: source } });
    useAppStore.getState().setProgramScene(scene.id);
  }
  useAppStore.setState({ isCutToBlack: false, isLowerThirdHidden: false, displayTextMode: "show" });
  const current = useAppStore.getState();
  const slides = item.slides.map((slide, index) => ({ ...slide, id: `service:${scheduleId}:${item.id}:${index}`, deckId: `service:${scheduleId}:${item.id}`, deckTitle: item.title }));
  await current.stageLowerThird([...current.settings.lowerThird.slides.filter(slide => !slide.id.startsWith("service:")), ...slides], slides[slideIndex].id, true);
};

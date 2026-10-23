import { SanctuaryDisplayState } from "../../shared/types";
import { normalizeSanctuaryDisplay } from "../../shared/sanctuaryDisplay";
import { useAppStore } from "../store/useAppStore";
import { isPresentationTextSource, visiblePresentationSourceIds } from "./presentationText";

type ContentState = Pick<ReturnType<typeof useAppStore.getState>, "settings" | "programSceneSnapshot" | "programSources" | "displayTextMode" | "isLowerThirdHidden">;

export const getSanctuaryDisplayState = (state: ContentState): SanctuaryDisplayState => {
  const config = normalizeSanctuaryDisplay(state.settings.sanctuaryDisplay);
  let text = config.customText;
  let reference = "";
  if (config.textSource === "program") {
    const slide = state.settings.lowerThird.slides.find(slide => slide.id === state.settings.lowerThird.programSlideId);
    if (slide) {
      text = state.isLowerThirdHidden ? "" : slide.text;
      reference = state.isLowerThirdHidden ? "" : slide.reference ?? "";
    } else {
      const visible = visiblePresentationSourceIds(state.programSceneSnapshot, state.programSources, state.settings.lowerThird.allowMultipleTextLayers, false);
      text = (state.programSceneSnapshot?.enabled === false ? [] : state.programSceneSnapshot?.sourceIds ?? []).flatMap(id => {
        const source = state.programSources[id];
        if (source?.type !== "text" || !source.enabled) return [];
        if (state.isLowerThirdHidden && source.data.role === "lower-third") return [];
        if (isPresentationTextSource(source) && visible && !visible.has(id)) return [];
        return [source.data.text];
      }).join("\n\n");
    }
  }
  const scrollingSources = state.programSceneSnapshot?.enabled === false ? [] : (state.programSceneSnapshot?.sourceIds ?? []).flatMap(id => {
    const source = state.programSources[id];
    return source?.type === "scrolling-text" && source.enabled ? [source] : [];
  });
  return { settings: config, text, reference, textMode: state.displayTextMode, scrollingSources,
    exitDurationMs: state.settings.lowerThird.animationDurationMs,
    logoUrl: state.settings.lowerThird.imageUrl || state.settings.lowerThird.bibleImageUrl };
};

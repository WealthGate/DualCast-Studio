import { beforeEach, describe, expect, it } from "vitest";
import { StudioState } from "../../../shared/types";
import { useAppStore } from "../useAppStore";

const studioState: StudioState = {
  scenes: [{ id: "scene-a", name: "Sermon", sourceIds: ["text-a"] }],
  sources: {
    "text-a": {
      id: "text-a",
      name: "Title",
      type: "text",
      rect: { x: 5, y: 70, width: 90, height: 20 },
      enabled: true,
      audioEnabled: false,
      data: { text: "Original", fontSize: 48, color: "#fff", backgroundColor: "#000", align: "center" }
    }
  },
  groups: [],
  previewSceneId: "scene-a",
  programSceneId: "scene-a"
};

describe("Preview and Program isolation", () => {
  beforeEach(() => {
    useAppStore.getState().setStudioState(studioState);
    const settings = useAppStore.getState().settings;
    useAppStore.getState().setSettings({
      ...settings,
      lowerThird: {
        ...settings.lowerThird,
        slides: [],
        activeSlideId: null,
        programSlideId: null,
        allowMultipleTextLayers: false
      }
    });
  });

  it("keeps Preview edits out of Program until TAKE", () => {
    const initialProgramSource = Object.values(useAppStore.getState().programSources)[0];
    expect(initialProgramSource.type === "text" && initialProgramSource.data.text).toBe("Original");

    useAppStore.getState().updateSource("text-a", { data: { ...studioState.sources["text-a"].data, text: "Preview edit" } } as never);
    const unchangedProgramSource = Object.values(useAppStore.getState().programSources)[0];
    expect(unchangedProgramSource.type === "text" && unchangedProgramSource.data.text).toBe("Original");

    useAppStore.getState().takeToProgram();
    const takenProgramSource = Object.values(useAppStore.getState().programSources)[0];
    expect(takenProgramSource.type === "text" && takenProgramSource.data.text).toBe("Preview edit");
  });

  it("keeps the live Program scene when Preview tries to delete it", () => {
    useAppStore.getState().removeScene("scene-a");

    expect(useAppStore.getState().scenes.map((scene) => scene.id)).toContain("scene-a");
    expect(useAppStore.getState().programSceneSnapshot?.sourceIds).toHaveLength(1);
  });

  it("keeps Preview crop changes out of Program until TAKE", () => {
    useAppStore.getState().updateSource("text-a", { crop: { top: 8, right: 0, bottom: 0, left: 0 } });
    const unchangedProgramSource = Object.values(useAppStore.getState().programSources)[0];
    expect(unchangedProgramSource.crop?.top ?? 0).toBe(0);

    useAppStore.getState().takeToProgram();
    const takenProgramSource = Object.values(useAppStore.getState().programSources)[0];
    expect(takenProgramSource.crop?.top).toBe(8);
  });

  it("holds a manual blend until the operator completes Preview to Program", () => {
    useAppStore.getState().setStudioState({
      ...studioState,
      scenes: [
        ...studioState.scenes,
        { id: "scene-b", name: "Lyrics", sourceIds: [] }
      ],
      previewSceneId: "scene-b",
      programSceneId: "scene-a"
    });

    useAppStore.getState().setManualBlend(0.55);
    expect(useAppStore.getState().programSceneId).toBe("scene-a");
    expect(useAppStore.getState().manualBlend).toBe(0.55);

    useAppStore.getState().completeManualBlend();
    expect(useAppStore.getState().programSceneId).toBe("scene-b");
    expect(useAppStore.getState().manualBlend).toBe(0);
    expect(useAppStore.getState().programTransitionMode).toBe("none");
  });

  it("clamps manual blend values and clears them on a direct Program scene change", () => {
    useAppStore.getState().setManualBlend(2);
    expect(useAppStore.getState().manualBlend).toBe(1);

    useAppStore.getState().setProgramScene("scene-a");
    expect(useAppStore.getState().manualBlend).toBe(0);
    expect(useAppStore.getState().programTransitionMode).toBe("configured");
  });

  it("stages configured text in Preview without changing Program text", async () => {
    const slide = { id: "slide-1", text: "Amazing grace", kind: "song" as const };
    await useAppStore.getState().stageLowerThird([slide], slide.id);

    expect(useAppStore.getState().settings.lowerThird.activeSlideId).toBe(slide.id);
    expect(useAppStore.getState().settings.lowerThird.programSlideId).toBeNull();

    useAppStore.getState().takeToProgram();
    expect(useAppStore.getState().settings.lowerThird.programSlideId).toBe(slide.id);
  });

  it("removes an existing managed scene text layer when exclusive mode stages lyrics", async () => {
    useAppStore.getState().setStudioState({
      ...studioState,
      sources: {
        ...studioState.sources,
        "text-a": {
          id: "text-a",
          name: "Scripture - John 3:16",
          type: "text",
          rect: { x: 5, y: 70, width: 90, height: 20 },
          enabled: true,
          audioEnabled: false,
          data: { text: "John 3:16", fontSize: 48, color: "#fff", backgroundColor: "#000", align: "center", role: "presentation" }
        }
      }
    });
    const slide = { id: "slide-1", text: "Amazing grace", kind: "song" as const };
    await useAppStore.getState().stageLowerThird([slide], slide.id);

    expect(useAppStore.getState().scenes[0].sourceIds).toEqual([]);
    expect(useAppStore.getState().sources["text-a"]).toBeUndefined();
  });
});

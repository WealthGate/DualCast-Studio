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
  beforeEach(() => useAppStore.getState().setStudioState(studioState));

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
});

import { describe, expect, it } from "vitest";
import { normalizeStudioState } from "../settings";

describe("studio settings recovery", () => {
  it("falls back to a safe scene for damaged settings", () => {
    const state = normalizeStudioState({ scenes: "not-an-array", sources: null, groups: 42 });

    expect(state.scenes).toEqual([{ id: "scene-1", name: "Scene 1", sourceIds: [] }]);
    expect(state.previewSceneId).toBe("scene-1");
    expect(state.programSceneId).toBe("scene-1");
  });

  it("repairs source geometry and removes broken references", () => {
    const state = normalizeStudioState({
      scenes: [{ id: "scene-a", name: "Recovered", sourceIds: ["image-a", "missing"] }],
      sources: {
        "image-a": {
          type: "image",
          name: "Photo",
          rect: { x: -20, y: 120, width: 500, height: -1 },
          enabled: true,
          groupId: "missing-group",
          data: { url: "file:///photo.png" }
        },
        broken: { type: "unknown" }
      },
      previewSceneId: "missing-scene",
      programSceneId: "scene-a"
    });

    expect(state.scenes[0].sourceIds).toEqual(["image-a"]);
    expect(state.sources.broken).toBeUndefined();
    expect(state.sources["image-a"].rect).toEqual({ x: 0, y: 99, width: 100, height: 1 });
    expect(state.sources["image-a"].groupId).toBeNull();
    expect(state.previewSceneId).toBe("scene-a");
  });
});

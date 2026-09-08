import { describe, expect, it } from "vitest";
import { Scene, Source } from "../../../shared/types";
import { removePresentationTextSources, visiblePresentationSourceIds } from "../presentationText";

const textSource = (id: string, role: "standard" | "presentation"): Source => ({
  id,
  name: role === "presentation" ? "Scripture - John 3:16" : "Clock",
  type: "text",
  rect: { x: 0, y: 0, width: 100, height: 100 },
  enabled: true,
  audioEnabled: false,
  data: { text: id, fontSize: 48, color: "#fff", backgroundColor: "#000", align: "center", role }
});

describe("exclusive presentation text", () => {
  it("removes managed lyrics or Scripture while preserving ordinary text", () => {
    const scene: Scene = { id: "scene", name: "Scene", sourceIds: ["clock", "verse"] };
    const sources = { clock: textSource("clock", "standard"), verse: textSource("verse", "presentation") };
    const result = removePresentationTextSources(scene, sources);
    expect(result.scene.sourceIds).toEqual(["clock"]);
    expect(result.sources.verse).toBeUndefined();
  });

  it("hides scene presentation text when a configured text slide is staged", () => {
    const scene: Scene = { id: "scene", name: "Scene", sourceIds: ["verse"] };
    const sources = { verse: textSource("verse", "presentation") };
    expect(visiblePresentationSourceIds(scene, sources, false, true)).toEqual(new Set());
    expect(visiblePresentationSourceIds(scene, sources, true, true)).toBeNull();
  });
});

import { describe, expect, it } from "vitest";
import { Scene } from "../../../shared/types";
import { collectActiveSourceIds } from "../PreviewProgram";

describe("Preview and Program media retention", () => {
  it("keeps isolated Program media active while Multiview is open", () => {
    const scenes: Scene[] = [{ id: "scene-a", name: "Preview", sourceIds: ["camera-a"] }];
    const programScene: Scene = {
      id: "scene-program",
      name: "Program",
      sourceIds: ["program:camera-a"]
    };

    const ids = collectActiveSourceIds(true, scenes, programScene, scenes[0]);

    expect(Array.from(ids)).toEqual(expect.arrayContaining(["camera-a", "program:camera-a"]));
  });
});

import { describe, expect, it } from "vitest";
import { Scene, Source } from "../../../shared/types";
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

  it("keeps persistent audio active when its scene is not selected", () => {
    const previewScene: Scene = { id: "scene-b", name: "Camera", sourceIds: [] };
    const persistentAudio: Source = {
      id: "audio-a",
      name: "Room audio",
      type: "audio",
      rect: { x: 0, y: 0, width: 0, height: 0 },
      enabled: true,
      audioEnabled: true,
      audioScope: "persistent",
      data: { url: "file:///room.wav", loop: true }
    };

    const ids = collectActiveSourceIds(false, [previewScene], null, previewScene, { "audio-a": persistentAudio });

    expect(ids.has("audio-a")).toBe(true);
  });

  it("does not capture sources that are disabled", () => {
    const scene: Scene = { id: "scene-a", name: "Preview", sourceIds: ["camera-a"] };
    const camera: Source = {
      id: "camera-a",
      name: "Hidden camera",
      type: "camera",
      rect: { x: 0, y: 0, width: 100, height: 100 },
      enabled: false,
      audioEnabled: false,
      data: { deviceId: "camera-device" }
    };

    const ids = collectActiveSourceIds(false, [scene], null, scene, { "camera-a": camera });

    expect(ids.has("camera-a")).toBe(false);
  });
});

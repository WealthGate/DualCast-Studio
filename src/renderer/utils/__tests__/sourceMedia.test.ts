import { describe, expect, it, vi } from "vitest";
import { Source } from "../../../shared/types";
import { compositeSceneBlend, sourceMediaReady, sourceMediaSignature } from "../sourceMedia";
import { resizeCanvas } from "../../hooks/useCanvasRenderer";

const camera: Source = { id: "cam", name: "Camera", type: "camera", rect: { x: 0, y: 0, width: 100, height: 100 }, enabled: true, audioEnabled: false, data: { deviceId: "camera-1" } };
describe("live canvas continuity", () => {
  it("does not clear the bitmap when its dimensions are unchanged", () => {
    const width = vi.fn();
    const canvas = { get width() { return 1920; }, set width(value: number) { width(value); }, height: 1080 };
    resizeCanvas(canvas as HTMLCanvasElement, 1920, 1080);
    expect(width).not.toHaveBeenCalled();
  });
  it("does not restart a capture for position, name, volume, or Program snapshot edits", () => {
    expect(sourceMediaSignature({ ...camera, id: "program:cam", name: "New", volume: 0.5, rect: { x: 5, y: 10, width: 90, height: 80 } })).toBe(sourceMediaSignature(camera));
    expect(sourceMediaSignature({ ...camera, data: { deviceId: "camera-2" } })).not.toBe(sourceMediaSignature(camera));
  });
  it("waits for real video pixels before making a camera live", () => {
    expect(sourceMediaReady(camera)).toBe(false);
    expect(sourceMediaReady(camera, { videoEl: { readyState: 1, videoWidth: 1920 } as HTMLVideoElement })).toBe(false);
    expect(sourceMediaReady(camera, { videoEl: { readyState: 2, videoWidth: 1920 } as HTMLVideoElement })).toBe(true);
  });
  it("uses native pixels directly and does not hold a scene for a failed source", () => {
    expect(sourceMediaReady(camera, { canvas: { width: 1920, height: 1080 } as HTMLCanvasElement })).toBe(true);
    expect(sourceMediaReady(camera, { error: "Window closed" })).toBe(true);
  });
  it("crossfades over the full outgoing frame rather than dimming both over black", () => {
    const alphas: number[] = [];
    const ctx = { globalAlpha: 1, save: vi.fn(), restore: vi.fn(), drawImage: () => alphas.push(ctx.globalAlpha) };
    compositeSceneBlend(ctx as unknown as CanvasRenderingContext2D, {} as CanvasImageSource, {} as CanvasImageSource, 0.5, 1920, 1080);
    expect(alphas).toEqual([1, 0.5]);
  });
});

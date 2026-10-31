import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { executeRemoteCommand, getRemoteControlState } from "../remoteControl";
import { useAppStore } from "../../store/useAppStore";
import { defaultScrollingText } from "../../../shared/scrollingText";
import type { Settings, SettingsUpdate } from "../../../shared/types";

const initial = useAppStore.getState();
const recorder = { startRecording: vi.fn(async () => {}), stopRecording: vi.fn() };
beforeEach(() => {
  useAppStore.setState(initial);
  vi.stubGlobal("window", { dualcast: {
    updateSettings: vi.fn(async (update: SettingsUpdate): Promise<Settings> => ({ ...useAppStore.getState().settings, ...update })),
    fetchScripture: vi.fn(async () => ({ reference: "John 3:16", text: "<p>For God so loved the world</p>" }))
  } });
  useAppStore.getState().setStudioState({
    scenes: [{ id: "a", name: "Wide", sourceIds: ["ticker", "camera"] }, { id: "b", name: "Close", sourceIds: [] }, { id: "off", name: "Disabled", sourceIds: [], enabled: false }],
    sources: {
      ticker: { id: "ticker", name: "Announcements", type: "scrolling-text", rect: { x: 0, y: 90, width: 100, height: 10 }, enabled: true, audioEnabled: false, data: { ...defaultScrollingText, text: "Original ticker" } },
      camera: { id: "camera", name: "Wide camera", type: "camera", rect: { x: 0, y: 0, width: 100, height: 100 }, enabled: true, audioEnabled: false, data: { deviceId: "private-camera-device-id" } }
    }, groups: [], previewSceneId: "b", programSceneId: "a"
  });
});
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); useAppStore.setState(initial); });
describe("mobile production controls", () => {
  it("stages camera scenes independently of Program and rejects disabled scenes", async () => {
    await executeRemoteCommand({ action: "scene-preview", sceneId: "a" }, recorder);
    expect(useAppStore.getState().programSceneId).toBe("a");
    await executeRemoteCommand({ action: "scene-live", sceneId: "b" }, recorder);
    expect(useAppStore.getState().programSceneId).toBe("b");
    await expect(executeRemoteCommand({ action: "scene-live", sceneId: "off" }, recorder)).rejects.toThrow("unavailable");
  });
  it("stages text privately, then commits it explicitly", async () => {
    await executeRemoteCommand({ action: "text-stage", title: "Welcome", text: "Welcome to church", lines: 2 }, recorder);
    let lower = useAppStore.getState().settings.lowerThird;
    expect(lower.activeSlideId).toBeTruthy(); expect(lower.programSlideId).toBeNull();
    await executeRemoteCommand({ action: "text-live" }, recorder);
    lower = useAppStore.getState().settings.lowerThird;
    expect(lower.programSlideId).toBe(lower.activeSlideId);
  });
  it("sanitizes Scripture and keeps it off Program until explicitly shown", async () => {
    await executeRemoteCommand({ action: "scripture-stage", reference: "John 3:16" }, recorder);
    const lower = useAppStore.getState().settings.lowerThird;
    expect(lower.slides.at(-1)?.text).toBe("For God so loved the world"); expect(lower.programSlideId).toBeNull();
  });
  it("does not apply delayed Scripture results after the command expires", async () => {
    const now = Date.now();
    window.dualcast.fetchScripture = vi.fn(async () => { vi.spyOn(Date, "now").mockReturnValue(now + 20_000); return { reference: "John 3:16", text: "For God so loved" }; });
    await expect(executeRemoteCommand({ action: "scripture-stage", reference: "John 3:16" }, recorder, now + 1000)).rejects.toThrow("expired");
    expect(useAppStore.getState().settings.lowerThird.slides).toHaveLength(0);
  });
  it("keeps slide navigation inside the current presentation", async () => {
    await useAppStore.getState().stageLowerThird([{ id: "one", text: "One", deckId: "song" }, { id: "two", text: "Two", deckId: "song" }, { id: "other", text: "Other", deckId: "scripture" }], "one", true);
    await executeRemoteCommand({ action: "slide-step", direction: 1, live: true }, recorder);
    expect(useAppStore.getState().settings.lowerThird.programSlideId).toBe("two");
    await expect(executeRemoteCommand({ action: "slide-step", direction: 1, live: true }, recorder)).rejects.toThrow("last slide");
    expect(useAppStore.getState().settings.lowerThird.programSlideId).toBe("two");
  });
  it("edits the committed ticker while leaving unrelated Preview edits staged", async () => {
    useAppStore.getState().setProgramScene("a"); useAppStore.getState().selectPreviewScene("b");
    useAppStore.getState().updateSource("ticker", { rect: { x: 10, y: 20, width: 70, height: 15 }, data: { ...defaultScrollingText, fontSize: 96 } });
    const snapshot = useAppStore.getState().programSceneSnapshot;
    await executeRemoteCommand({ action: "ticker", sourceId: "program:ticker", text: "Service at 10", speed: 80, direction: "right", enabled: true, paused: true }, recorder);
    const next = useAppStore.getState();
    expect(next.previewSceneId).toBe("b"); expect(next.programSceneSnapshot).toBe(snapshot);
    expect(next.programSources["program:ticker"].data).toMatchObject({ text: "Service at 10", speed: 80, direction: "right" });
    expect(next.programSources["program:ticker"].media?.paused).toBe(true);
    expect(next.sources.ticker.rect.x).toBe(10);
    expect(next.sources.ticker.data).toMatchObject({ fontSize: 96, text: "Service at 10" });
    expect(next.programSources["program:ticker"].data).toMatchObject({ fontSize: 48 });
  });
  it("uses explicit black/freeze states so repeated requests cannot toggle twice", async () => {
    for (let i = 0; i < 2; i++) await executeRemoteCommand({ action: "black", enabled: true }, recorder);
    expect(useAppStore.getState().isCutToBlack).toBe(true);
    for (let i = 0; i < 2; i++) await executeRemoteCommand({ action: "freeze", enabled: true }, recorder);
    expect(useAppStore.getState().isFrozen).toBe(true);
  });
  it("reports recording start failures instead of claiming success", async () => {
    await expect(executeRemoteCommand({ action: "record", enabled: true }, recorder)).rejects.toThrow("could not start");
  });
  it("publishes production state without settings, credentials, paths or camera device IDs", () => {
    const remote = getRemoteControlState("live");
    expect(remote.scenes[0].cameras).toEqual(["Wide camera"]);
    expect(JSON.stringify(remote)).not.toMatch(/operatorPin|rtmp|private-camera-device-id|saveDirectory|integrations/);
    expect(remote.streamStatus).toBe("live");
  });
});

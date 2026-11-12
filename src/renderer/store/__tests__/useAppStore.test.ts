import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Settings, SettingsUpdate, StudioState } from "../../../shared/types";
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
  it("publishes text to Preview and Program together without waiting for persistence", async () => {
    let finish: (value: Settings) => void = () => undefined;
    vi.stubGlobal("window", { dualcast: { updateSettings: vi.fn(() => new Promise((resolve) => { finish = resolve; })) } });
    const pending = useAppStore.getState().stageLowerThird([{ id: "quick-text", text: "Welcome", kind: "text" }], "quick-text", true);
    const settings = useAppStore.getState().settings;
    expect(settings.lowerThird.activeSlideId).toBe("quick-text");
    expect(settings.lowerThird.programSlideId).toBe("quick-text");
    expect(settings.lowerThird.showOnProgram).toBe(true);
    finish(settings);
    await pending;
  });
  it("hides Scripture in both views immediately while preserving slides and the scene", async () => {
    await useAppStore.getState().stageLowerThird([{ id: "verse", text: "For God so loved", kind: "scripture" }], "verse", true);
    const before = useAppStore.getState();
    let finish: (value: Settings) => void = () => undefined;
    vi.stubGlobal("window", { dualcast: { updateSettings: vi.fn(() => new Promise(resolve => { finish = resolve; })) } });
    const pending = before.hideScripture();
    const hidden = useAppStore.getState();
    expect(hidden.settings.lowerThird.activeSlideId).toBeNull();
    expect(hidden.settings.lowerThird.programSlideId).toBeNull();
    expect(hidden.settings.lowerThird.slides).toEqual(before.settings.lowerThird.slides);
    expect(hidden.programSceneSnapshot).toEqual(before.programSceneSnapshot);
    finish(hidden.settings);
    await pending;
  });
  it("hides only Scripture when another kind of text is in the other view", async () => {
    await useAppStore.getState().stageLowerThird([{ id: "verse", text: "Scripture", kind: "scripture" }, { id: "song", text: "Song", kind: "song" }], "verse", true);
    const settings = useAppStore.getState().settings;
    useAppStore.getState().setSettings({ ...settings, lowerThird: { ...settings.lowerThird, activeSlideId: "song" } });
    await useAppStore.getState().hideScripture();
    expect(useAppStore.getState().settings.lowerThird.activeSlideId).toBe("song");
    expect(useAppStore.getState().settings.lowerThird.programSlideId).toBeNull();
  });
  it("keeps scene visibility edits in Preview until committed and respects scene locks", () => {
    const store = useAppStore.getState();
    store.setStudioState(studioState);
    store.toggleSceneEnabled("scene-a");
    expect(useAppStore.getState().scenes[0].enabled).toBe(false);
    expect(useAppStore.getState().programSceneSnapshot?.enabled).not.toBe(false);
    store.setProgramScene("scene-a");
    expect(useAppStore.getState().programSceneSnapshot?.enabled).toBe(false);
    store.toggleSceneLocked("scene-a");
    store.toggleSceneEnabled("scene-a");
    expect(useAppStore.getState().scenes[0].enabled).toBe(false);
    store.toggleSceneLocked("scene-a");
    store.toggleSceneEnabled("scene-a");
    expect(useAppStore.getState().scenes[0].enabled).toBe(true);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    useAppStore.setState({ isProgramAudioMonitoring: false, programAudioMonitorGain: 0.8 });
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

  it("sends Preview immediately when a transition button is applied", () => {
    useAppStore.getState().setStudioState({
      ...studioState,
      scenes: [
        ...studioState.scenes,
        { id: "scene-b", name: "Lyrics", sourceIds: [] }
      ],
      previewSceneId: "scene-b",
      programSceneId: "scene-a"
    });
    const revision = useAppStore.getState().programRevision;

    useAppStore.getState().applyTransition("fade");

    expect(useAppStore.getState().transitionType).toBe("fade");
    expect(useAppStore.getState().programSceneId).toBe("scene-b");
    expect(useAppStore.getState().programRevision).toBe(revision + 1);
    expect(useAppStore.getState().programTransitionMode).toBe("configured");
  });

  it("persists the new Program scene when an immediate transition is applied", async () => {
    useAppStore.getState().setStudioState({
      ...studioState,
      scenes: [
        ...studioState.scenes,
        { id: "scene-b", name: "Lyrics", sourceIds: [] }
      ],
      previewSceneId: "scene-b",
      programSceneId: "scene-a"
    });
    const existingSettings = useAppStore.getState().settings;
    const updateSettings = vi.fn(async (update: SettingsUpdate) => ({ ...existingSettings, ...update }));
    vi.stubGlobal("window", { dualcast: { updateSettings } });

    useAppStore.getState().applyTransition("crossfade");

    await vi.waitFor(() => expect(updateSettings).toHaveBeenCalled());
    expect(updateSettings.mock.calls[0][0].studioState?.programSceneId).toBe("scene-b");
    expect(updateSettings.mock.calls[0][0].lowerThird?.programSlideId).toBe(
      existingSettings.lowerThird.activeSlideId
    );
  });

  it("does not clear Program when TAKE has no valid Preview scene", () => {
    const originalProgramScene = useAppStore.getState().programSceneId;
    const originalProgramSnapshot = useAppStore.getState().programSceneSnapshot;
    useAppStore.setState({ previewSceneId: null });

    useAppStore.getState().takeToProgram();

    expect(useAppStore.getState().programSceneId).toBe(originalProgramScene);
    expect(useAppStore.getState().programSceneSnapshot).toBe(originalProgramSnapshot);
  });

  it("keeps local Program monitoring opt-in and clamps its session volume", () => {
    expect(useAppStore.getState().isProgramAudioMonitoring).toBe(false);

    useAppStore.getState().setProgramAudioMonitoring(true);
    useAppStore.getState().setProgramAudioMonitorGain(3);

    expect(useAppStore.getState().isProgramAudioMonitoring).toBe(true);
    expect(useAppStore.getState().programAudioMonitorGain).toBe(1);

    useAppStore.getState().setProgramAudioMonitorGain(-1);
    expect(useAppStore.getState().programAudioMonitorGain).toBe(0);
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

  it("completes Preview to Program and resets a full manual blend", () => {
    useAppStore.getState().setStudioState({
      ...studioState,
      scenes: [
        ...studioState.scenes,
        { id: "scene-b", name: "Lyrics", sourceIds: [] }
      ],
      previewSceneId: "scene-b",
      programSceneId: "scene-a"
    });

    useAppStore.getState().setManualBlend(1);
    expect(useAppStore.getState().manualBlend).toBe(1);
    useAppStore.getState().completeManualBlend();
    expect(useAppStore.getState().programSceneId).toBe("scene-b");
    expect(useAppStore.getState().manualBlend).toBe(0);
  });

  it("clears a held manual blend on a direct Program scene change", () => {
    useAppStore.getState().setManualBlend(0.75);
    expect(useAppStore.getState().manualBlend).toBe(0.75);

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


describe("Output controls", () => {
  it("changes output text mode without destroying staged text", () => {
    const before = useAppStore.getState();
    before.setDisplayTextMode("hide");
    expect(useAppStore.getState().displayTextMode).toBe("hide");
    expect(useAppStore.getState().sources).toBe(before.sources);
    expect(useAppStore.getState().settings.lowerThird.slides).toBe(before.settings.lowerThird.slides);
    before.setDisplayTextMode("show");
  });
  it("applies cursor changes to the live snapshot while preserving staged edits", () => {
    useAppStore.getState().setStudioState(studioState);
    useAppStore.getState().updateSource("text-a", { captureCursor: "always" });
    useAppStore.getState().updateSource("text-a", { captureCursor: "never" });
    expect(useAppStore.getState().programSources["program:text-a"].captureCursor).toBe("never");
    expect(useAppStore.getState().programSources["program:text-a"].data).toMatchObject(studioState.sources["text-a"].data);
  });
});


describe("Transition scene swapping", () => {
  const prepare = (swapPreviewProgram: boolean) => {
    const state = useAppStore.getState();
    state.setSettings({ ...state.settings, swapPreviewProgram });
    state.setStudioState({ ...studioState,
      scenes: [...studioState.scenes, { id: "scene-b", name: "Next", sourceIds: [] }],
      previewSceneId: "scene-b", programSceneId: "scene-a" });
  };
  it("swaps Preview and Program for TAKE and manual completion", () => {
    prepare(true);
    useAppStore.getState().takeToProgram();
    expect(useAppStore.getState().programSceneId).toBe("scene-b");
    expect(useAppStore.getState().previewSceneId).toBe("scene-a");
    useAppStore.getState().setManualBlend(1);
    useAppStore.getState().completeManualBlend();
    expect(useAppStore.getState().programSceneId).toBe("scene-a");
    expect(useAppStore.getState().previewSceneId).toBe("scene-b");
    expect(useAppStore.getState().manualBlend).toBe(0);
  });
  it("keeps Preview when swapping is disabled", () => {
    prepare(false);
    useAppStore.getState().applyTransition("cut");
    expect(useAppStore.getState().previewSceneId).toBe("scene-b");
    expect(useAppStore.getState().programSceneId).toBe("scene-b");
  });
});


describe("Whole lower-third visibility", () => {
  it("toggles visibility without clearing cues, branding, or scene text", () => {
    useAppStore.setState({ isLowerThirdHidden: false });
    const before = useAppStore.getState();
    before.toggleLowerThirdHidden();
    expect(useAppStore.getState().isLowerThirdHidden).toBe(true);
    expect(useAppStore.getState().settings.lowerThird).toBe(before.settings.lowerThird);
    expect(useAppStore.getState().sources).toBe(before.sources);
    expect(useAppStore.getState().programSources).toBe(before.programSources);
    before.toggleLowerThirdHidden();
    expect(useAppStore.getState().isLowerThirdHidden).toBe(false);
  });
});

describe("settings persistence ordering", () => {
  afterEach(() => vi.unstubAllGlobals());
  it("restores the previous background when persistence fails", async () => {
    const previous = useAppStore.getState().settings;
    vi.stubGlobal("window", { dualcast: { updateSettings: vi.fn().mockRejectedValue(Error("Disk full")) } });
    await expect(useAppStore.getState().updateSettings({ displayBackgrounds: { displays: {} } })).rejects.toThrow("Disk full");
    expect(useAppStore.getState().settings.displayBackgrounds).toBe(previous.displayBackgrounds);
  });
  it.each([false, true])("restores saved values when overlapping writes both fail (newest first: %s)", async newestFirst => {
    const original = useAppStore.getState().settings.masterAudioGain;
    const failures: ((error: Error) => void)[] = [];
    vi.stubGlobal("window", { dualcast: { updateSettings: vi.fn(() => new Promise((_resolve, reject) => failures.push(reject))) } });
    const first = expect(useAppStore.getState().updateSettings({ masterAudioGain: 0.3 })).rejects.toThrow("Disk full");
    const second = expect(useAppStore.getState().updateSettings({ masterAudioGain: 0.6 })).rejects.toThrow("Disk full");
    const order = newestFirst ? [1, 0] : [0, 1];
    failures[order[0]](Error("Disk full")); await (newestFirst ? second : first);
    failures[order[1]](Error("Disk full")); await (newestFirst ? first : second);
    expect(useAppStore.getState().settings.masterAudioGain).toBe(original);
  });
  it.each([0.2, 0.8])("keeps a newer saved value %s when an older settings save fails", async gain => {
    let reject: (error: Error) => void = () => undefined;
    vi.stubGlobal("window", { dualcast: { updateSettings: vi.fn().mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }))
      .mockImplementationOnce(async (update: SettingsUpdate) => ({ ...useAppStore.getState().settings, ...update })) } });
    const first = useAppStore.getState().updateSettings({ masterAudioGain: 0.2 });
    const failed = expect(first).rejects.toThrow("Disk full");
    await useAppStore.getState().updateSettings({ masterAudioGain: gain });
    reject(Error("Disk full")); await failed;
    expect(useAppStore.getState().settings.masterAudioGain).toBe(gain);
  });
  it("does not let an old save restore an older cue or fader value", async () => {
    const original = useAppStore.getState().settings;
    const replies: ((settings: Settings) => void)[] = [];
    vi.stubGlobal("window", { dualcast: { updateSettings: vi.fn(() => new Promise<Settings>(resolve => replies.push(resolve))) } });
    const first = useAppStore.getState().updateSettings({ masterAudioGain: 0.2 });
    const second = useAppStore.getState().updateSettings({ masterAudioGain: 0.8 });
    expect(useAppStore.getState().settings.masterAudioGain).toBe(0.8);
    replies[1]({ ...original, masterAudioGain: 0.8 }); await second;
    replies[0]({ ...original, masterAudioGain: 0.2 }); await first;
    expect(useAppStore.getState().settings.masterAudioGain).toBe(0.8);
  });
});

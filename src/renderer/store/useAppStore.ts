import { create } from "zustand";
import {
  AudioMode,
  DisplaySource,
  FrameRatePreset,
  QualityPreset,
  SaveRecordingResult,
  Scene,
  Settings,
  SettingsUpdate,
  Source,
  SourceGroup,
  SourceRect,
  StudioState
} from "../../shared/types";

const defaultStudioState: StudioState = {
  scenes: [{ id: "scene-1", name: "Scene 1", sourceIds: [] }],
  sources: {},
  groups: [],
  previewSceneId: "scene-1",
  programSceneId: "scene-1"
};

const defaultSettings: Settings = {
  saveDirectory: "",
  qualityPreset: "medium",
  frameRate: 30,
  audioMode: "system",
  lastDisplayId: null,
  streamRtmpUrl: "",
  streamPreset: "medium",
  streamFps: 30,
  streamAudioBitrate: 128,
  streamEncoder: "auto",
  rememberStreamKey: false,
  streamDestinations: [{ id: "primary", name: "Primary Stream", rtmpUrl: "", enabled: true }],
  operatorStationName: "Main Director",
  operatorRole: "director",
  masterAudioGain: 1,
  theme: "system",
  lowerThird: {
    enabled: false,
    displayId: null,
    heightPercent: 28,
    position: "bottom",
    backgroundColor: "#101722",
    textColor: "#ffffff",
    fontSize: 48,
    fontFamily: "Segoe UI",
    bold: true,
    italic: false,
    underline: false,
    textAlign: "center",
    imageUrl: "",
    imagePosition: "left",
    entranceAnimation: "fade",
    exitAnimation: "fade",
    animationDurationMs: 450,
    showOnProgram: true,
    maxLines: 0,
    slides: [],
    activeSlideId: null
  },
  networkOutput: {
    enabled: false,
    port: 8787,
    operatorPin: "2468"
  },
  integrations: {
    songProvider: "local",
    songLibraryPath: "",
    songApiUrl: "",
    scriptureProvider: "api-bible",
    scriptureApiUrl: "https://api.scripture.api.bible/v1",
    scriptureApiKeyEnv: "OPENCHURCH_SCRIPTURE_API_KEY",
    scriptureBibleId: "",
    aiProvider: "disabled",
    aiBaseUrl: "https://api.openai.com/v1",
    aiModel: "gpt-5.6-sol",
    aiApiKeyEnv: "OPENAI_API_KEY",
    aiLiveCaptions: false,
    aiSermonSummary: false,
    aiHighlightDetection: false
  },
  studioState: defaultStudioState
};

const getId = () => (crypto?.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`);

type ProgramSnapshot = {
  scene: Scene | null;
  sources: Record<string, Source>;
};

const createProgramSnapshot = (scene: Scene | null, sources: Record<string, Source>): ProgramSnapshot => {
  if (!scene) {
    return { scene: null, sources: {} };
  }
  const snapshotSources: Record<string, Source> = {};
  const sourceIds = scene.sourceIds.flatMap((sourceId) => {
    const source = sources[sourceId];
    if (!source) {
      return [];
    }
    const snapshotId = `program:${sourceId}`;
    snapshotSources[snapshotId] = {
      ...source,
      id: snapshotId,
      rect: { ...source.rect },
      data: { ...source.data },
      media: source.media ? { ...source.media } : undefined
    } as Source;
    return [snapshotId];
  });
  return {
    scene: { ...scene, sourceIds },
    sources: snapshotSources
  };
};

const defaultProgramSnapshot = createProgramSnapshot(defaultStudioState.scenes[0], defaultStudioState.sources);

type AppState = {
  displays: DisplaySource[];
  scenes: Scene[];
  sources: Record<string, Source>;
  groups: SourceGroup[];
  previewSceneId: string | null;
  programSceneId: string | null;
  programSceneSnapshot: Scene | null;
  programSources: Record<string, Source>;
  programRevision: number;
  selectedSourceId: string | null;
  programAudioStream: MediaStream | null;
  isProjecting: boolean;
  isLowerThirdProjecting: boolean;
  projectionTargetIds: string[];
  isCutToBlack: boolean;
  isFrozen: boolean;
  transitionType: "cut" | "fade" | "crossfade";
  transitionDurationMs: number;
  isRecording: boolean;
  recordingSeconds: number;
  recordingResult: SaveRecordingResult | null;
  recordingError: string | null;
  settings: Settings;
  setDisplays: (displays: DisplaySource[]) => void;
  refreshDisplays: () => Promise<void>;
  setStudioState: (studioState: StudioState) => void;
  persistStudioState: () => Promise<void>;
  addScene: () => void;
  renameScene: (sceneId: string, name: string) => void;
  removeScene: (sceneId: string) => void;
  toggleSceneLocked: (sceneId: string) => void;
  selectPreviewScene: (sceneId: string) => void;
  setProgramScene: (sceneId: string) => void;
  takeToProgram: () => void;
  addSourceToScene: (sceneId: string, source: Omit<Source, "id">) => void;
  removeSourceFromScene: (sceneId: string, sourceId: string) => void;
  moveSourceInScene: (sceneId: string, sourceId: string, direction: -1 | 1) => void;
  updateSourceRect: (sourceId: string, rect: SourceRect) => void;
  updateSource: (sourceId: string, update: Partial<Source>) => void;
  toggleSourceEnabled: (sourceId: string) => void;
  toggleSourceAudio: (sourceId: string) => void;
  toggleSourceLocked: (sourceId: string) => void;
  setSourceGroup: (sourceId: string, groupId: string | null) => void;
  addGroup: (name?: string) => string;
  renameGroup: (groupId: string, name: string) => void;
  removeGroup: (groupId: string) => void;
  setTransitionType: (value: "cut" | "fade" | "crossfade") => void;
  setTransitionDuration: (value: number) => void;
  setSourceMediaPaused: (sourceId: string, paused: boolean) => void;
  restartSourceMedia: (sourceId: string) => void;
  setSelectedSourceId: (sourceId: string | null) => void;
  setProgramAudioStream: (stream: MediaStream | null) => void;
  setIsProjecting: (value: boolean) => void;
  setIsLowerThirdProjecting: (value: boolean) => void;
  setProjectionTargetIds: (displayIds: string[]) => void;
  cutToBlack: () => void;
  clearCutToBlack: () => void;
  toggleFreeze: () => void;
  setRecordingState: (isRecording: boolean) => void;
  setRecordingSeconds: (seconds: number | ((prev: number) => number)) => void;
  setRecordingResult: (result: SaveRecordingResult | null) => void;
  setRecordingError: (message: string | null) => void;
  setSettings: (settings: Settings) => void;
  updateSettings: (update: SettingsUpdate) => Promise<void>;
};

const normalizeStudioState = (studioState: StudioState) => {
  const scenes = studioState.scenes?.length ? studioState.scenes : defaultStudioState.scenes;
  const previewSceneId = studioState.previewSceneId ?? scenes[0]?.id ?? null;
  const programSceneId = studioState.programSceneId ?? previewSceneId;
  const groups = studioState.groups ?? [];
  const sources = Object.fromEntries(
    Object.entries(studioState.sources ?? {}).map(([id, source]) => [
      id,
      {
        rotation: 0,
        locked: false,
        groupId: null,
        volume: 1,
        media: { paused: false, restartToken: 0 },
        ...source
      }
    ])
  ) as Record<string, Source>;
  return {
    scenes,
    sources,
    groups,
    previewSceneId,
    programSceneId
  };
};

export const useAppStore = create<AppState>((set, get) => ({
  displays: [],
  scenes: defaultStudioState.scenes,
  sources: defaultStudioState.sources,
  groups: defaultStudioState.groups,
  previewSceneId: defaultStudioState.previewSceneId,
  programSceneId: defaultStudioState.programSceneId,
  programSceneSnapshot: defaultProgramSnapshot.scene,
  programSources: defaultProgramSnapshot.sources,
  programRevision: 0,
  selectedSourceId: null,
  programAudioStream: null,
  isProjecting: false,
  isLowerThirdProjecting: false,
  projectionTargetIds: [],
  isCutToBlack: false,
  isFrozen: false,
  transitionType: "cut",
  transitionDurationMs: 400,
  isRecording: false,
  recordingSeconds: 0,
  recordingResult: null,
  recordingError: null,
  settings: defaultSettings,
  setDisplays: (displays) => set({ displays }),
  refreshDisplays: async () => {
    const displays = await window.dualcast.listDisplays();
    set({ displays });
  },
  setStudioState: (studioState) => {
    const normalized = normalizeStudioState(studioState);
    const programScene = normalized.scenes.find((scene) => scene.id === normalized.programSceneId) ?? null;
    const snapshot = createProgramSnapshot(programScene, normalized.sources);
    set({ ...normalized, programSceneSnapshot: snapshot.scene, programSources: snapshot.sources, programRevision: 1 });
  },
  persistStudioState: async () => {
    const { scenes, sources, groups, previewSceneId, programSceneId } = get();
    const updated = await window.dualcast.updateSettings({
      studioState: { scenes, sources, groups, previewSceneId, programSceneId }
    });
    set({ settings: updated });
  },
  addScene: () => {
    const id = getId();
    const scene: Scene = { id, name: `Scene ${get().scenes.length + 1}`, sourceIds: [] };
    set((state) => ({
      scenes: [...state.scenes, scene],
      previewSceneId: state.previewSceneId ?? id,
      programSceneId: state.programSceneId ?? id
    }));
  },
  renameScene: (sceneId, name) =>
    set((state) => ({
      scenes: state.scenes.map((scene) => (scene.id === sceneId ? { ...scene, name } : scene))
    })),
  removeScene: (sceneId) => {
    set((state) => {
      const scenes = state.scenes.filter((scene) => scene.id !== sceneId);
      const previewSceneId = state.previewSceneId === sceneId ? scenes[0]?.id ?? null : state.previewSceneId;
      const programSceneId = state.programSceneId === sceneId ? scenes[0]?.id ?? null : state.programSceneId;
      return { scenes, previewSceneId, programSceneId };
    });
  },
  toggleSceneLocked: (sceneId) =>
    set((state) => ({
      scenes: state.scenes.map((scene) =>
        scene.id === sceneId ? { ...scene, locked: !scene.locked } : scene
      )
    })),
  selectPreviewScene: (sceneId) => {
    if (get().scenes.some((scene) => scene.id === sceneId)) {
      set({ previewSceneId: sceneId });
    }
  },
  setProgramScene: (sceneId) => {
    const state = get();
    const scene = state.scenes.find((candidate) => candidate.id === sceneId);
    if (scene) {
      const snapshot = createProgramSnapshot(scene, state.sources);
      set({
        programSceneId: sceneId,
        programSceneSnapshot: snapshot.scene,
        programSources: snapshot.sources,
        programRevision: state.programRevision + 1
      });
    }
  },
  takeToProgram: () => set((state) => {
    const scene = state.scenes.find((candidate) => candidate.id === state.previewSceneId) ?? null;
    const snapshot = createProgramSnapshot(scene, state.sources);
    return {
      programSceneId: state.previewSceneId,
      programSceneSnapshot: snapshot.scene,
      programSources: snapshot.sources,
      programRevision: state.programRevision + 1
    };
  }),
  addSourceToScene: (sceneId, source) => {
    const id = getId();
    const nextSource = {
      rotation: 0,
      locked: false,
      groupId: null,
      volume: 1,
      media: { paused: false, restartToken: 0 },
      ...source,
      id
    } as Source;
    set((state) => ({
      sources: {
        ...state.sources,
        [id]: nextSource
      },
      scenes: state.scenes.map((scene) =>
        scene.id === sceneId ? { ...scene, sourceIds: [...scene.sourceIds, id] } : scene
      )
    }));
  },
  removeSourceFromScene: (sceneId, sourceId) => {
    set((state) => {
      const { [sourceId]: _, ...rest } = state.sources;
      return {
        sources: rest,
        scenes: state.scenes.map((scene) =>
          scene.id === sceneId ? { ...scene, sourceIds: scene.sourceIds.filter((id) => id !== sourceId) } : scene
        ),
        selectedSourceId: state.selectedSourceId === sourceId ? null : state.selectedSourceId
      };
    });
  },
  moveSourceInScene: (sceneId, sourceId, direction) => {
    set((state) => ({
      scenes: state.scenes.map((scene) => {
        if (scene.id !== sceneId) {
          return scene;
        }
        const index = scene.sourceIds.indexOf(sourceId);
        if (index < 0) {
          return scene;
        }
        const nextIndex = index + direction;
        if (nextIndex < 0 || nextIndex >= scene.sourceIds.length) {
          return scene;
        }
        const next = [...scene.sourceIds];
        next.splice(index, 1);
        next.splice(nextIndex, 0, sourceId);
        return { ...scene, sourceIds: next };
      })
    }));
  },
  updateSourceRect: (sourceId, rect) =>
    set((state) => {
      const current = state.sources[sourceId];
      if (!current) {
        return state;
      }
      return {
        sources: {
          ...state.sources,
          [sourceId]: { ...current, rect }
        }
      };
    }),
  updateSource: (sourceId, update) =>
    set((state) => {
      const current = state.sources[sourceId];
      if (!current) {
        return state;
      }
      return {
        sources: {
          ...state.sources,
          [sourceId]: { ...current, ...update } as Source
        }
      };
    }),
  toggleSourceEnabled: (sourceId) =>
    set((state) => {
      const current = state.sources[sourceId];
      if (!current) {
        return state;
      }
      return {
        sources: {
          ...state.sources,
          [sourceId]: { ...current, enabled: !current.enabled }
        }
      };
    }),
  toggleSourceAudio: (sourceId) =>
    set((state) => {
      const current = state.sources[sourceId];
      if (!current) {
        return state;
      }
      return {
        sources: {
          ...state.sources,
          [sourceId]: { ...current, audioEnabled: !current.audioEnabled }
        }
      };
    }),
  toggleSourceLocked: (sourceId) =>
    set((state) => {
      const current = state.sources[sourceId];
      if (!current) {
        return state;
      }
      return {
        sources: {
          ...state.sources,
          [sourceId]: { ...current, locked: !current.locked }
        }
      };
    }),
  setSourceGroup: (sourceId, groupId) =>
    set((state) => {
      const current = state.sources[sourceId];
      if (!current) {
        return state;
      }
      return {
        sources: {
          ...state.sources,
          [sourceId]: { ...current, groupId }
        }
      };
    }),
  addGroup: (name) => {
    const id = getId();
    const group: SourceGroup = { id, name: name?.trim() || `Group ${get().groups.length + 1}` };
    set((state) => ({ groups: [...state.groups, group] }));
    return id;
  },
  renameGroup: (groupId, name) =>
    set((state) => ({
      groups: state.groups.map((group) => (group.id === groupId ? { ...group, name } : group))
    })),
  removeGroup: (groupId) =>
    set((state) => {
      const groups = state.groups.filter((group) => group.id !== groupId);
      const sources = Object.fromEntries(
        Object.entries(state.sources).map(([id, source]) => [
          id,
          source.groupId === groupId ? { ...source, groupId: null } : source
        ])
      ) as Record<string, Source>;
      return { groups, sources };
    }),
  setTransitionType: (value) => set({ transitionType: value }),
  setTransitionDuration: (value) => set({ transitionDurationMs: Math.max(100, Math.min(3000, value)) }),
  setSourceMediaPaused: (sourceId, paused) =>
    set((state) => {
      const current = state.sources[sourceId];
      if (!current) {
        return state;
      }
      return {
        sources: {
          ...state.sources,
          [sourceId]: {
            ...current,
            media: { ...(current.media ?? {}), paused }
          }
        }
      };
    }),
  restartSourceMedia: (sourceId) =>
    set((state) => {
      const current = state.sources[sourceId];
      if (!current) {
        return state;
      }
      const nextToken = (current.media?.restartToken ?? 0) + 1;
      return {
        sources: {
          ...state.sources,
          [sourceId]: {
            ...current,
            media: { ...(current.media ?? {}), restartToken: nextToken }
          }
        }
      };
    }),
  setSelectedSourceId: (sourceId) => set({ selectedSourceId: sourceId }),
  setProgramAudioStream: (stream) => set({ programAudioStream: stream }),
  setIsProjecting: (isProjecting) => set({ isProjecting }),
  setIsLowerThirdProjecting: (isLowerThirdProjecting) => set({ isLowerThirdProjecting }),
  setProjectionTargetIds: (projectionTargetIds) => set({ projectionTargetIds }),
  cutToBlack: () => set({ isCutToBlack: true }),
  clearCutToBlack: () => set({ isCutToBlack: false }),
  toggleFreeze: () => set((state) => ({ isFrozen: !state.isFrozen })),
  setRecordingState: (isRecording) => set({ isRecording }),
  setRecordingSeconds: (seconds) =>
    set((state) => ({
      recordingSeconds: typeof seconds === "function" ? seconds(state.recordingSeconds) : seconds
    })),
  setRecordingResult: (result) => set({ recordingResult: result }),
  setRecordingError: (message) => set({ recordingError: message }),
  setSettings: (settings) => set({ settings }),
  updateSettings: async (update) => {
    const updated = await window.dualcast.updateSettings(update);
    set({ settings: updated });
  }
}));

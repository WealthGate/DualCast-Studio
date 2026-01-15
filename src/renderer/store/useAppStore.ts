import { create } from "zustand";
import { AudioMode, DisplaySource, FrameRatePreset, QualityPreset, SaveRecordingResult, Settings, SettingsUpdate } from "../../shared/types";

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
  rememberStreamKey: false
};

type AppState = {
  displays: DisplaySource[];
  previewSourceId: string | null;
  programSourceId: string | null;
  cameraDeviceId: string | null;
  cameraOverlayMode: "none" | "camera-over-program" | "program-over-camera";
  cameraRect: { x: number; y: number; width: number; height: number };
  isCutToBlack: boolean;
  isFrozen: boolean;
  isRecording: boolean;
  recordingSeconds: number;
  recordingResult: SaveRecordingResult | null;
  recordingError: string | null;
  settings: Settings;
  setDisplays: (displays: DisplaySource[]) => void;
  refreshDisplays: () => Promise<void>;
  setPreviewSourceId: (id: string) => Promise<void>;
  setProgramSourceId: (id: string | null) => void;
  setCameraDeviceId: (id: string | null) => void;
  setCameraOverlayMode: (mode: "none" | "camera-over-program" | "program-over-camera") => void;
  updateCameraRect: (rect: Partial<{ x: number; y: number; width: number; height: number }>) => void;
  takeToProgram: () => void;
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

export const useAppStore = create<AppState>((set, get) => ({
  displays: [],
  previewSourceId: null,
  programSourceId: null,
  cameraDeviceId: null,
  cameraOverlayMode: "none",
  cameraRect: { x: 70, y: 70, width: 25, height: 25 },
  isCutToBlack: false,
  isFrozen: false,
  isRecording: false,
  recordingSeconds: 0,
  recordingResult: null,
  recordingError: null,
  settings: defaultSettings,
  setDisplays: (displays) => set({ displays }),
  refreshDisplays: async () => {
    const displays = await window.dualcast.listDisplays();
    set({ displays });

    const lastDisplayId = get().settings.lastDisplayId;
    if (lastDisplayId && displays.some((display) => display.id === lastDisplayId)) {
      set({ previewSourceId: lastDisplayId });
    }
  },
  setPreviewSourceId: async (id) => {
    set({ previewSourceId: id });
    await window.dualcast.updateSettings({ lastDisplayId: id });
  },
  setProgramSourceId: (id) => set({ programSourceId: id, isCutToBlack: false }),
  setCameraDeviceId: (id) => set({ cameraDeviceId: id }),
  setCameraOverlayMode: (mode) => set({ cameraOverlayMode: mode }),
  updateCameraRect: (rect) =>
    set((state) => ({
      cameraRect: {
        x: rect.x ?? state.cameraRect.x,
        y: rect.y ?? state.cameraRect.y,
        width: rect.width ?? state.cameraRect.width,
        height: rect.height ?? state.cameraRect.height
      }
    })),
  takeToProgram: () =>
    set((state) => ({
      programSourceId: state.previewSourceId,
      isCutToBlack: false
    })),
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

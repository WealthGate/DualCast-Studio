import { useAppStore } from "./store/useAppStore";

const noopUnsubscribe = () => undefined;
const emptyNetworkStatus = {
  running: false,
  port: 8787,
  programUrls: [],
  operatorUrls: []
};

export const installDevelopmentBridge = () => {
  if (window.dualcast) {
    return;
  }

  window.dualcast = {
    listDisplays: async () => [],
    getSettings: async () => useAppStore.getState().settings,
    updateSettings: async (update) => ({ ...useAppStore.getState().settings, ...update }),
    selectSaveDirectory: async () => null,
    saveRecording: async () => {
      throw new Error("Recording is available in the Electron desktop app.");
    },
    openFolder: async () => false,
    openProjection: async () => false,
    closeProjection: async () => false,
    openLowerThird: async () => false,
    closeLowerThird: async () => false,
    startStream: async () => ({ ok: false, message: "Streaming is available in the Electron desktop app." }),
    stopStream: async () => ({ ok: true }),
    sendStreamChunk: () => undefined,
    getStreamLogPath: async () => null,
    getStreamLogContent: async () => "",
    getStreamingCapabilities: async () => ({ encoders: ["x264"] }),
    getStoredStreamKey: async () => null,
    setStoredStreamKey: async () => false,
    clearStoredStreamKey: async () => true,
    startNetworkOutput: async () => emptyNetworkStatus,
    stopNetworkOutput: async () => emptyNetworkStatus,
    getNetworkOutputStatus: async () => emptyNetworkStatus,
    exportClip: async () => {
      throw new Error("Clip export is available in the Electron desktop app.");
    },
    selectMediaFile: async () => null,
    createBrowserSource: async () => false,
    updateBrowserSource: async () => false,
    destroyBrowserSource: async () => true,
    onStreamStatus: () => noopUnsubscribe,
    updateProgramState: () => undefined,
    sendProgramFrame: () => undefined,
    sendLowerThirdFrame: () => undefined,
    onBrowserFrame: () => noopUnsubscribe,
    onProgramFrame: () => noopUnsubscribe,
    onLowerThirdFrame: () => noopUnsubscribe,
    onProgramState: () => noopUnsubscribe,
    onProjectionOpened: () => noopUnsubscribe,
    onProjectionClosed: () => noopUnsubscribe,
    onLowerThirdOpened: () => noopUnsubscribe,
    onLowerThirdClosed: () => noopUnsubscribe,
    onHotkey: () => noopUnsubscribe,
    onRemoteOperatorAction: () => noopUnsubscribe
  };
};

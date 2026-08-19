import { useAppStore } from "./store/useAppStore";
import packageJson from "../../package.json";

const noopUnsubscribe = () => undefined;
const emptyNetworkStatus = {
  running: false,
  port: 8787,
  programUrls: [],
  operatorUrls: []
};

const getDemoFrame = (label: string, color: string) =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180"><rect width="320" height="180" fill="${color}"/><circle cx="160" cy="74" r="32" fill="#ffffff" opacity=".16"/><text x="160" y="135" fill="#ffffff" font-family="Segoe UI, sans-serif" font-size="18" text-anchor="middle">${label}</text></svg>`)}`;

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
    openMultiview: async () => false,
    closeMultiview: async () => false,
    getUpdateStatus: async () => ({ state: "idle", currentVersion: packageJson.version }),
    checkForUpdates: async () => ({ state: "idle", currentVersion: packageJson.version, message: "Update checks run in the installed desktop app." }),
    downloadUpdate: async () => false,
    installUpdate: async () => false,
    openReleasePage: async () => false,
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
    fetchScripture: async ({ reference }) => ({ reference, text: "Development preview: Scripture lookup runs in the Electron desktop app." }),
    authorizeStreaming: async () => ({ ok: false, message: "Account authorization runs in the Electron desktop app." }),
    downloadUserGuide: async () => null,
    onStreamStatus: () => noopUnsubscribe,
    updateProgramState: () => undefined,
    sendProgramFrame: () => undefined,
    sendLowerThirdFrame: () => undefined,
    sendMultiviewData: () => undefined,
    sendMultiviewAction: () => undefined,
    onBrowserFrame: () => noopUnsubscribe,
    onProgramFrame: () => noopUnsubscribe,
    onLowerThirdFrame: () => noopUnsubscribe,
    onProgramState: () => noopUnsubscribe,
    onProjectionOpened: () => noopUnsubscribe,
    onProjectionClosed: () => noopUnsubscribe,
    onLowerThirdOpened: () => noopUnsubscribe,
    onLowerThirdClosed: () => noopUnsubscribe,
    onMultiviewOpened: () => noopUnsubscribe,
    onMultiviewClosed: () => noopUnsubscribe,
    onMultiviewData: (handler) => {
      const timeout = window.setTimeout(() => handler({
        previewSceneId: "scene-2",
        programSceneId: "scene-1",
        tiles: [
          { id: "scene:1", kind: "scene", name: "Main Sanctuary", sceneId: "scene-1", subtitle: "4 sources", dataUrl: getDemoFrame("Main Sanctuary", "#27324f") },
          { id: "scene:2", kind: "scene", name: "Worship Wide", sceneId: "scene-2", subtitle: "3 sources", dataUrl: getDemoFrame("Worship Wide", "#253f42") },
          { id: "scene:3", kind: "scene", name: "Sermon + Scripture", sceneId: "scene-3", subtitle: "5 sources", dataUrl: getDemoFrame("Sermon + Scripture", "#432d46") },
          { id: "camera:1", kind: "camera", name: "Pulpit Camera", sceneId: "scene-1", subtitle: "Routes Main Sanctuary", dataUrl: getDemoFrame("Pulpit Camera", "#453331") },
          { id: "camera:2", kind: "camera", name: "Choir Camera", sceneId: "scene-2", subtitle: "Routes Worship Wide", dataUrl: getDemoFrame("Choir Camera", "#293b54") }
        ]
      }), 50);
      return () => window.clearTimeout(timeout);
    },
    onMultiviewAction: () => noopUnsubscribe,
    onUpdateStatus: () => noopUnsubscribe,
    onHotkey: () => noopUnsubscribe,
    onRemoteOperatorAction: () => noopUnsubscribe
  };
};

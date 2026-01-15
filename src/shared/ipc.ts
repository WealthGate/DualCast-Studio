export const IpcChannels = {
  listDisplays: "dualcast:list-displays",
  getSettings: "dualcast:get-settings",
  updateSettings: "dualcast:update-settings",
  selectSaveDirectory: "dualcast:select-save-directory",
  saveRecording: "dualcast:save-recording",
  openFolder: "dualcast:open-folder",
  hotkey: "dualcast:hotkey",
  openProjection: "dualcast:open-projection",
  closeProjection: "dualcast:close-projection",
  updateProgramState: "dualcast:update-program-state",
  programState: "dualcast:program-state",
  projectionClosed: "dualcast:projection-closed",
  projectionOpened: "dualcast:projection-opened",
  programFrame: "dualcast:program-frame",
  startStream: "dualcast:start-stream",
  stopStream: "dualcast:stop-stream",
  streamChunk: "dualcast:stream-chunk",
  streamStatus: "dualcast:stream-status",
  getStreamLogPath: "dualcast:get-stream-log-path",
  getStreamingCapabilities: "dualcast:get-streaming-capabilities",
  getStoredStreamKey: "dualcast:get-stored-stream-key",
  setStoredStreamKey: "dualcast:set-stored-stream-key",
  clearStoredStreamKey: "dualcast:clear-stored-stream-key"
} as const;

export type IpcChannel = (typeof IpcChannels)[keyof typeof IpcChannels];

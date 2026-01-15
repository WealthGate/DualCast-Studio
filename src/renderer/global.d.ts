import {
  DisplaySource,
  SaveRecordingPayload,
  SaveRecordingResult,
  Settings,
  SettingsUpdate,
  HotkeyAction,
  ProgramState,
  StreamStartPayload,
  StreamStartResult,
  StreamStopResult,
  StreamStatusPayload
} from "../shared/types";

declare global {
  interface Window {
    dualcast: {
      listDisplays: () => Promise<DisplaySource[]>;
      getSettings: () => Promise<Settings>;
      updateSettings: (update: SettingsUpdate) => Promise<Settings>;
      selectSaveDirectory: () => Promise<string | null>;
      saveRecording: (payload: SaveRecordingPayload) => Promise<SaveRecordingResult>;
      openFolder: (filePath: string) => Promise<boolean>;
      openProjection: (displayId?: string | null) => Promise<boolean>;
      closeProjection: () => Promise<boolean>;
      startStream: (payload: StreamStartPayload) => Promise<StreamStartResult>;
      stopStream: () => Promise<StreamStopResult>;
      sendStreamChunk: (payload: Uint8Array) => void;
      getStreamLogPath: () => Promise<string | null>;
      onStreamStatus: (handler: (payload: StreamStatusPayload) => void) => () => void;
      updateProgramState: (state: ProgramState) => void;
      sendProgramFrame: (dataUrl: string) => void;
      onProgramFrame: (handler: (dataUrl: string) => void) => () => void;
      onProgramState: (handler: (state: ProgramState) => void) => () => void;
      onProjectionOpened: (handler: () => void) => () => void;
      onProjectionClosed: (handler: () => void) => () => void;
      onHotkey: (handler: (action: HotkeyAction) => void) => () => void;
    };
  }
}

export {};

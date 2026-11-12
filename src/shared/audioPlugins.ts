export type AudioPluginInfo = {
  id: string;
  name: string;
  vendor: string;
  format: "vst2";
  hasEditor: boolean;
  inputs: number;
  outputs: number;
  latencyFrames: number;
  available?: boolean;
};

export type AudioPluginStatus = {
  supported: boolean;
  plugins: AudioPluginInfo[];
  activeId: string | null;
  running: boolean;
  session: string | null;
  message: string;
  scan?: { checked: number; added: number; existing: number; issues: string[]; limited: boolean };
};

export type AudioPluginAction = { action: "add" | "scan" | "scan-folder" | "start" | "stop" | "editor" | "remove"; id?: string };

export type AudioPluginBlock = { session: string; sequence: number; samples: Float32Array };
export const AUDIO_PLUGIN_BLOCK_FRAMES = 512;
export const AUDIO_PLUGIN_SAMPLE_RATE = 48000;

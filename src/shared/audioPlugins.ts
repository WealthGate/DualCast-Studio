export type AudioPluginInfo = {
  id: string;
  name: string;
  vendor: string;
  format: "vst2";
  hasEditor: boolean;
  inputs: number;
  outputs: number;
  latencyFrames: number;
};

export type AudioPluginStatus = {
  supported: boolean;
  plugins: AudioPluginInfo[];
  activeId: string | null;
  running: boolean;
  session: string | null;
  message: string;
};

export type AudioPluginBlock = { session: string; sequence: number; samples: Float32Array };
export const AUDIO_PLUGIN_BLOCK_FRAMES = 512;
export const AUDIO_PLUGIN_SAMPLE_RATE = 48000;

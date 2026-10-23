import { normalizeProgramEqualizer, ProgramEqualizerSettings } from "../../shared/programAudio";

const smooth = (param: AudioParam, value: number, time: number) => {
  param.cancelAndHoldAtTime(time);
  param.setTargetAtTime(value, time, 0.008);
};

// Three native Web Audio biquads run on the audio render thread. No script audio
// callbacks, per-sample IPC, dynamics processing, or automatic level changes.
export const createProgramEqualizer = (context: BaseAudioContext) => {
  const input = context.createGain();
  const output = context.createGain();
  const dry = context.createGain();
  const wet = context.createGain();
  const low = context.createBiquadFilter();
  low.type = "lowshelf";
  low.frequency.value = 180;
  const mid = context.createBiquadFilter();
  mid.type = "peaking";
  mid.frequency.value = 1000;
  mid.Q.value = 0.7;
  const high = context.createBiquadFilter();
  high.type = "highshelf";
  high.frequency.value = 6000;
  input.connect(dry);
  dry.connect(output);
  input.connect(low);
  low.connect(mid);
  mid.connect(high);
  high.connect(wet);
  wet.connect(output);
  wet.gain.value = 0;
  return {
    input, output,
    update: (value: ProgramEqualizerSettings | undefined) => {
      const eq = normalizeProgramEqualizer(value);
      const time = context.currentTime;
      smooth(low.gain, eq.lowGainDb, time);
      smooth(mid.gain, eq.midGainDb, time);
      smooth(high.gain, eq.highGainDb, time);
      smooth(dry.gain, eq.enabled ? 0 : 1, time);
      smooth(wet.gain, eq.enabled ? 1 : 0, time);
    },
    stop: () => [input, output, dry, wet, low, mid, high].forEach(node => node.disconnect())
  };
};

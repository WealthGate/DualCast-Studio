import { AudioInputPreset } from "../../shared/programAudio";

const fadeSeconds = 0.02;
// Chromium's compressor adds makeup gain. Match preset loudness before the
// operator's fader and leave headroom for the two summed Choir taps.
const presetTrim: Record<AudioInputPreset, number> = { clean: 1, radio: 0.51, vocal: 0.65, choir: 0.55 };

export const createAudioInputEffect = (context: BaseAudioContext, initialPreset: AudioInputPreset) => {
  const input = context.createGain();
  const output = context.createGain();

  const createPath = (preset: AudioInputPreset, gain: number) => {
    const level = context.createGain();
    level.gain.value = gain * presetTrim[preset];
    level.connect(output);
    const nodes: AudioNode[] = [level];
    const oscillators: OscillatorNode[] = [];
    let first: AudioNode = level;

    if (preset !== "clean") {
      const highpass = context.createBiquadFilter();
      highpass.type = "highpass";
      highpass.frequency.value = preset === "radio" ? 75 : 90;
      highpass.Q.value = -3;
      first = highpass;

      const tone = context.createBiquadFilter();
      tone.type = preset === "radio" ? "lowshelf" : "peaking";
      tone.frequency.value = preset === "radio" ? 165 : 280;
      tone.gain.value = preset === "radio" ? 2.5 : -2.5;
      tone.Q.value = 0.85;
      highpass.connect(tone);

      const presence = context.createBiquadFilter();
      presence.type = "peaking";
      presence.frequency.value = preset === "radio" ? 2650 : 3300;
      presence.gain.value = preset === "radio" ? 3 : 2;
      presence.Q.value = 0.85;
      tone.connect(presence);

      const compressor = context.createDynamicsCompressor();
      compressor.threshold.value = preset === "radio" ? -22 : -18;
      compressor.knee.value = 16;
      compressor.ratio.value = preset === "radio" ? 3.5 : 2.5;
      compressor.attack.value = preset === "radio" ? 0.004 : 0.01;
      compressor.release.value = 0.12;
      presence.connect(compressor);
      compressor.connect(level);
      nodes.push(highpass, tone, presence, compressor);

      if (preset === "choir") {
        // Modulated short taps spread vowel harmonics while leaving the direct
        // vocal in the center. No feedback, model, or per-sample JavaScript.
        for (const voice of [
          { delay: 0.019, rate: 0.72, pan: -0.85 },
          { delay: 0.034, rate: 1.03, pan: 0.85 }
        ]) {
          const delay = context.createDelay(0.05);
          delay.delayTime.value = voice.delay;
          const drift = context.createOscillator();
          drift.frequency.value = voice.rate;
          const depth = context.createGain();
          depth.gain.value = 0.0023;
          drift.connect(depth).connect(delay.delayTime);
          drift.start();
          oscillators.push(drift);

          const wet = context.createGain();
          wet.gain.value = 0.27;
          const pan = context.createStereoPanner();
          pan.pan.value = voice.pan;
          compressor.connect(delay).connect(wet).connect(pan).connect(level);
          nodes.push(delay, drift, depth, wet, pan);
        }
      }
    }

    input.connect(first);
    return {
      level,
      stop: () => {
        input.disconnect(first);
        oscillators.forEach(oscillator => oscillator.stop());
        nodes.forEach(node => node.disconnect());
      }
    };
  };

  let preset = initialPreset;
  type Path = ReturnType<typeof createPath> & { cleanup?: ReturnType<typeof setTimeout> };
  const paths = new Map<AudioInputPreset, Path>([[preset, createPath(preset, 1)]]);

  return {
    input,
    output,
    setPreset: (next: AudioInputPreset) => {
      if (next === preset) return;
      const now = context.currentTime;
      const end = now + fadeSeconds;
      const previous = preset;
      const retiring = paths.get(previous)!;
      retiring.level.gain.cancelAndHoldAtTime(now);
      retiring.level.gain.linearRampToValueAtTime(0, end);
      retiring.cleanup = setTimeout(() => {
        retiring.stop();
        paths.delete(previous);
      }, 60);
      const current: Path = paths.get(next) ?? createPath(next, 0);
      clearTimeout(current.cleanup);
      current.level.gain.cancelAndHoldAtTime(now);
      current.level.gain.linearRampToValueAtTime(presetTrim[next], end);
      paths.set(next, current);
      preset = next;
    },
    stop: () => {
      paths.forEach(path => {
        clearTimeout(path.cleanup);
        path.stop();
      });
      paths.clear();
      output.disconnect();
    }
  };
};

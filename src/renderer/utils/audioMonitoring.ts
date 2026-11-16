const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const resolveProgramMonitorGain = (enabled: boolean, gain: number) =>
  enabled ? clamp(Number.isFinite(gain) ? gain : 0.8, 0, 1) : 0;

export const createProgramAudioMonitor = (
  audioContext: AudioContext,
  masterGain: GainNode,
  enabled: boolean,
  gain: number
) => {
  const monitorGain = audioContext.createGain();
  monitorGain.gain.value = resolveProgramMonitorGain(enabled, gain);
  masterGain.connect(monitorGain);
  monitorGain.connect(audioContext.destination);
  return monitorGain;
};

export const updateProgramAudioMonitor = (
  monitorGain: GainNode | null,
  enabled: boolean,
  gain: number
) => {
  if (monitorGain) {
    monitorGain.gain.value = resolveProgramMonitorGain(enabled, gain);
  }
};

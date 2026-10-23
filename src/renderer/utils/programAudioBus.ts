import { createStereoProgramOutput, setProgramChannelMode } from "./audioChannels";
import { createProgramAudioMonitor } from "./audioMonitoring";

// Keep one output track for the entire studio session. Replacing/closing this
// destination on TAKE or a gain edit permanently silences existing recorders.
export const createProgramAudioBus = () => {
  const context = new AudioContext({ latencyHint: "interactive", sampleRate: 48000 });
  const destination = context.createMediaStreamDestination();
  const masterGain = context.createGain();
  setProgramChannelMode(masterGain, "stereo");
  const output = createStereoProgramOutput(context, masterGain);
  output.connect(destination);
  const monitor = createProgramAudioMonitor(context, output, false, 0);
  const silence = context.createConstantSource();
  silence.offset.value = 0;
  silence.connect(masterGain);
  silence.start();
  const resume = () => {
    if (context.state === "suspended" || (context.state as string) === "interrupted") {
      void context.resume().catch(() => undefined);
    }
  };
  context.addEventListener("statechange", resume);
  resume();
  return {
    context, destination, masterGain, output, monitor,
    stop: () => {
      context.removeEventListener("statechange", resume);
      silence.stop();
      destination.stream.getTracks().forEach(track => track.stop());
      void context.close().catch(() => undefined);
    }
  };
};

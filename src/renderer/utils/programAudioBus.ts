import { createStereoProgramOutput, setProgramChannelMode } from "./audioChannels";
import { createProgramAudioMonitor } from "./audioMonitoring";
import { createProgramEqualizer } from "./programEqualizer";
import { AudioMeterSnapshot } from "../audioMeterBus";

export type ProgramAudioSource = { id: string; stream: MediaStream; gain: number };

const gainValue = (value: number) => Number.isFinite(value) ? Math.min(2, Math.max(0, value)) : 1;
const setGain = (node: GainNode, value: number, time: number) => {
  const next = gainValue(value);
  node.gain.cancelAndHoldAtTime(time);
  node.gain.setTargetAtTime(next, time, 0.008);
};

const createMeter = (context: BaseAudioContext, input: AudioNode, channels: 1 | 2) => {
  const splitter = context.createChannelSplitter(channels);
  input.connect(splitter);
  const analysers = Array.from({ length: channels }, (_, channel) => {
    const analyser = context.createAnalyser();
    analyser.fftSize = 256;
    splitter.connect(analyser, channel);
    return { analyser, buffer: new Float32Array(analyser.fftSize) };
  });
  return {
    read: () => {
      const peaks = analysers.map(({ analyser, buffer }) => {
        analyser.getFloatTimeDomainData(buffer);
        let peak = 0;
        for (let index = 0; index < buffer.length; index += 1) peak = Math.max(peak, Math.abs(buffer[index]));
        return peak;
      });
      const level = (peak: number) => Math.min(1, Math.max(0, ((peak > 0 ? 20 * Math.log10(peak) : -60) + 60) / 60));
      return { left: level(peaks[0]), right: level(peaks[1] ?? peaks[0]), channels, clipping: peaks.some(peak => peak >= 0.985) };
    },
    stop: () => {
      input.disconnect(splitter);
      splitter.disconnect();
      analysers.forEach(({ analyser }) => analyser.disconnect());
    }
  };
};

// Keep one output track for the entire studio session. Replacing/closing this
// destination on TAKE or a gain edit permanently silences existing recorders.
export const createProgramAudioBus = () => {
  const context = new AudioContext({ latencyHint: "interactive", sampleRate: 48000 });
  const destination = context.createMediaStreamDestination();
  const masterGain = context.createGain();
  setProgramChannelMode(masterGain, "stereo");
  const equalizer = createProgramEqualizer(context);
  // Generators and network receiver plugins may produce signal with silent
  // input. Keep the EQ, final master and Mute all downstream of the insert.
  const pluginInput = context.createGain();
  pluginInput.connect(equalizer.input);
  equalizer.output.connect(masterGain);
  const output = createStereoProgramOutput(context, masterGain);
  let pluginNode: AudioNode | null = null;
  output.connect(destination);
  const monitor = createProgramAudioMonitor(context, output, false, 0);
  const masterMeter = createMeter(context, output, 2);
  const routes = new Map<string, {
    stream: MediaStream; source: MediaStreamAudioSourceNode; gain: GainNode; meter: ReturnType<typeof createMeter>;
  }>();
  const removeRoute = (id: string) => {
    const route = routes.get(id);
    if (!route) return;
    route.meter.stop();
    route.source.disconnect();
    route.gain.disconnect();
    routes.delete(id);
  };
  const silence = context.createConstantSource();
  silence.offset.value = 0;
  silence.connect(pluginInput);
  silence.start();
  const resume = () => {
    if (context.state === "suspended" || (context.state as string) === "interrupted") {
      void context.resume().catch(() => undefined);
    }
  };
  context.addEventListener("statechange", resume);
  resume();
  return {
    context, destination, masterGain, output, monitor, equalizer, pluginInput,
    setMasterGain: (value: number) => setGain(masterGain, value, context.currentTime),
    setPluginNode: (node: AudioNode | null) => {
      if (node === pluginNode) return;
      // Connect the replacement before removing the previous edge, within one
      // JS task, so the audio thread never sees a disconnected destination.
      if (node) node.connect(equalizer.input);
      pluginInput.connect(node ?? equalizer.input);
      pluginInput.disconnect(pluginNode ?? equalizer.input);
      pluginNode?.disconnect(equalizer.input);
      pluginNode = node;
    },
    setSources: (sources: ProgramAudioSource[]) => {
      const active = new Set<string>();
      for (const entry of sources) {
        if (active.has(entry.id) || !entry.stream.getAudioTracks().some(track => track.readyState !== "ended")) continue;
        active.add(entry.id);
        let route = routes.get(entry.id);
        if (route?.stream !== entry.stream) {
          removeRoute(entry.id);
          try {
            const source = context.createMediaStreamSource(entry.stream);
            const gain = context.createGain();
            gain.gain.value = gainValue(entry.gain);
            source.connect(gain);
            gain.connect(pluginInput);
            const channels = entry.stream.getAudioTracks()[0]?.getSettings().channelCount === 1 ? 1 : 2;
            route = { stream: entry.stream, source, gain, meter: createMeter(context, gain, channels) };
            routes.set(entry.id, route);
          } catch {
            // A restricted or stopped source cannot silence the rest of Program.
            continue;
          }
        }
        if (route) setGain(route.gain, entry.gain, context.currentTime);
      }
      Array.from(routes.keys()).filter(id => !active.has(id)).forEach(removeRoute);
      resume();
    },
    readMeters: (): AudioMeterSnapshot => {
      const meters: AudioMeterSnapshot = { master: masterMeter.read() };
      routes.forEach((route, id) => { meters[id] = route.meter.read(); });
      return meters;
    },
    stop: () => {
      context.removeEventListener("statechange", resume);
      Array.from(routes.keys()).forEach(removeRoute);
      masterMeter.stop();
      equalizer.stop();
      pluginInput.disconnect();
      pluginNode?.disconnect(equalizer.input);
      silence.stop();
      destination.stream.getTracks().forEach(track => track.stop());
      void context.close().catch(() => undefined);
    }
  };
};

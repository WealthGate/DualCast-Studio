import { createStereoProgramOutput, setProgramChannelMode } from "./audioChannels";
import { createProgramAudioMonitor } from "./audioMonitoring";
import { createProgramEqualizer } from "./programEqualizer";
import { AudioMeterSnapshot } from "../audioMeterBus";
import { AudioInputPreset, maxAudioInputChannels } from "../../shared/programAudio";
import { createAudioInputEffect } from "./audioInputEffects";

export type ProgramAudioSource = {
  id: string;
  stream: MediaStream;
  gain: number;
  channel?: number | null;
  preset?: AudioInputPreset;
};

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
    read: (meterChannels: 1 | 2 = channels) => {
      const peaks = analysers.slice(0, meterChannels).map(({ analyser, buffer }) => {
        analyser.getFloatTimeDomainData(buffer);
        let peak = 0;
        for (let index = 0; index < buffer.length; index += 1) peak = Math.max(peak, Math.abs(buffer[index]));
        return peak;
      });
      const level = (peak: number) => Math.min(1, Math.max(0, ((peak > 0 ? 20 * Math.log10(peak) : -60) + 60) / 60));
      return { left: level(peaks[0]), right: level(peaks[1] ?? peaks[0]), channels: meterChannels, clipping: peaks.some(peak => peak >= 0.985) };
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
  const sourceFallback = context.createGain();
  sourceFallback.connect(equalizer.input);
  pluginInput.connect(sourceFallback);
  equalizer.output.connect(masterGain);
  const output = createStereoProgramOutput(context, masterGain);
  let pluginNode: AudioNode | null = null;
  output.connect(destination);
  const monitor = createProgramAudioMonitor(context, output, false, 0);
  const masterMeter = createMeter(context, output, 2);
  const inputs = new Map<MediaStream, { source: MediaStreamAudioSourceNode; splitter?: ChannelSplitterNode; users: number }>();
  const routes = new Map<string, {
    stream: MediaStream;
    channel: number | null;
    input: AudioNode;
    gain: GainNode;
    targetGain: number;
    effect?: ReturnType<typeof createAudioInputEffect>;
    meter: ReturnType<typeof createMeter>;
    meterChannels: 1 | 2;
  }>();
  const removeRoute = (id: string) => {
    const route = routes.get(id);
    if (!route) return;
    route.meter.stop();
    route.input.disconnect(route.effect?.input ?? route.gain, (route.channel ?? 1) - 1);
    route.effect?.stop();
    route.gain.disconnect();
    const input = inputs.get(route.stream)!;
    input.users -= 1;
    if (input.users === 0) {
      input.source.disconnect();
      input.splitter?.disconnect();
      inputs.delete(route.stream);
    }
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
    setPluginReplacement: (replace: boolean) => { sourceFallback.gain.value = replace ? 0 : 1; },
    setPluginNode: (node: AudioNode | null) => {
      if (node === pluginNode) return;
      // Connect the replacement before removing the previous edge, within one
      // JS task, so the audio thread never sees a disconnected destination.
      if (node) node.connect(equalizer.input);
      pluginInput.connect(node ?? sourceFallback);
      pluginInput.disconnect(pluginNode ?? sourceFallback);
      pluginNode?.disconnect(equalizer.input);
      pluginNode = node;
    },
    setSources: (sources: ProgramAudioSource[]) => {
      const active = new Set<string>();
      for (const entry of sources) {
        if (active.has(entry.id)) continue;
        const track = entry.stream.getAudioTracks().find(track => track.readyState !== "ended");
        if (!track) continue;
        const channel = entry.channel ?? null;
        const availableChannels = track.getSettings().channelCount;
        if (channel && channel > (availableChannels ?? 1)) continue;
        const channels = channel || availableChannels === 1 ? 1 : 2;
        const meterChannels = entry.preset === "choir" ? 2 : channels;
        const targetGain = gainValue(entry.gain);
        active.add(entry.id);
        let route = routes.get(entry.id);
        if (route?.stream !== entry.stream || route.channel !== channel || Boolean(route.effect) !== Boolean(entry.preset)) {
          removeRoute(entry.id);
          let input = inputs.get(entry.stream);
          if (!input) {
            try {
              input = { source: context.createMediaStreamSource(entry.stream), users: 0 };
            } catch {
              // A restricted or stopped source cannot silence the rest of Program.
              continue;
            }
            inputs.set(entry.stream, input);
          }
          if (channel && !input.splitter) {
            input.splitter = context.createChannelSplitter(maxAudioInputChannels);
            input.source.connect(input.splitter);
          }
          const routeInput = channel ? input.splitter! : input.source;
          const gain = context.createGain();
          const effect = entry.preset && createAudioInputEffect(context, entry.preset);
          gain.gain.value = targetGain;
          routeInput.connect(effect?.input ?? gain, (channel ?? 1) - 1);
          effect?.output.connect(gain);
          gain.connect(pluginInput);
          input.users += 1;
          const meter = createMeter(context, gain, effect ? 2 : channels);
          route = { stream: entry.stream, channel, input: routeInput, gain, targetGain, effect, meter, meterChannels };
          routes.set(entry.id, route);
        }
        if (route.targetGain !== targetGain) setGain(route.gain, targetGain, context.currentTime);
        route.targetGain = targetGain;
        route.meterChannels = meterChannels;
        if (entry.preset) route.effect?.setPreset(entry.preset);
      }
      Array.from(routes.keys()).filter(id => !active.has(id)).forEach(removeRoute);
      resume();
    },
    readMeters: (): AudioMeterSnapshot => {
      const meters: AudioMeterSnapshot = { master: masterMeter.read() };
      routes.forEach((route, id) => { meters[id] = route.meter.read(route.meterChannels); });
      return meters;
    },
    stop: () => {
      context.removeEventListener("statechange", resume);
      Array.from(routes.keys()).forEach(removeRoute);
      masterMeter.stop();
      equalizer.stop();
      pluginInput.disconnect();
      sourceFallback.disconnect();
      pluginNode?.disconnect(equalizer.input);
      silence.stop();
      destination.stream.getTracks().forEach(track => track.stop());
      void context.close().catch(() => undefined);
    }
  };
};

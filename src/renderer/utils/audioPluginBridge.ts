import { AUDIO_WORKLET_URL, AudioPluginStatus } from "../../shared/audioPlugins";
import { createProgramAudioBus } from "./programAudioBus";
import processorUrl from "./audioPluginProcessor.js?url";

export const attachAudioPluginBridge = (bus: ReturnType<typeof createProgramAudioBus>, onStatus?: (status: AudioPluginStatus) => void) => {
  let stopped = false;
  let revision = 0;
  let node: AudioWorkletNode | null = null;
  let activeSession: string | null = null;
  let module: Promise<void> | null = null;
  let initializationFailed = false;
  let replacing = false;
  const reportBridgeFailure = () => { void window.dualcast.configureAudioPlugin({ action: "bridge-error" }).catch(() => undefined); };
  const clear = () => {
    bus.setPluginNode(null);
    node?.port.postMessage({ type: "stop" });
    node?.port.close();
    node?.disconnect();
    node = null; activeSession = null;
  };
  const apply = async (status: AudioPluginStatus) => {
    if (stopped) return;
    const replace = status.routing === "replace";
    const routingChanged = replace !== replacing;
    replacing = replace;
    bus.setPluginReplacement(replace);
    onStatus?.(status);
    if (node && status.session === activeSession && !routingChanged) return;
    if (initializationFailed && !status.session) return;
    const token = ++revision;
    activeSession = null;
    if (!status.supported && !node) return;
    if (node && (!status.running || !status.session)) {
      // Keep the short, fixed dry delay after bypass/failure. Removing it would
      // skip 43 ms of the live signal and change A/V timing mid-broadcast.
      node.port.postMessage({ type: "enabled", value: false, replace });
      return;
    }
    if (node) {
      activeSession = status.session;
      node.port.postMessage({ type: "enabled", value: true, replace, latencyFrames: status.plugins.find(plugin => plugin.id === status.activeId)?.latencyFrames ?? 0 });
      return;
    }
    try {
      const url = import.meta.env?.PROD && location.protocol === "file:" ? AUDIO_WORKLET_URL : processorUrl;
      module ??= bus.context.audioWorklet.addModule(url);
      await module;
      if (stopped || token !== revision) return;
      node = new AudioWorkletNode(bus.context, "openchurch-native-plugin", {
        numberOfInputs: 1, numberOfOutputs: 1, outputChannelCount: [2], channelCount: 2, channelCountMode: "explicit"
      });
      activeSession = status.session;
      node.port.onmessage = ({ data }) => {
        if (data.type === "input" && !stopped && activeSession) {
          window.dualcast.sendAudioPluginBlock({ session: activeSession, sequence: data.sequence, samples: data.samples });
        }
      };
      node.onprocessorerror = () => {
        initializationFailed = true;
        clear();
        reportBridgeFailure();
      };
      bus.setPluginNode(node);
      initializationFailed = false;
      node.port.postMessage({ type: "enabled", value: status.running, replace, latencyFrames: status.plugins.find(plugin => plugin.id === status.activeId)?.latencyFrames ?? 0 });
    } catch {
      if (stopped || token !== revision) return;
      clear(); module = null; initializationFailed = true;
      if (status.session) reportBridgeFailure();
    }
  };
  const offStatus = window.dualcast.onAudioPluginStatus(status => { void apply(status); });
  const offAudio = window.dualcast.onAudioPluginBlock(block => {
    if (node && block.session === activeSession) {
      const samples = block.samples;
      node.port.postMessage({ type: "output", sequence: block.sequence, samples }, [samples.buffer]);
    }
  });
  void window.dualcast.getAudioPluginStatus().then(status => { if (revision === 0) void apply(status); }).catch(() => undefined);
  return () => { stopped = true; revision++; offStatus(); offAudio(); clear(); };
};

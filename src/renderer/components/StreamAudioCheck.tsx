import { useState } from "react";
import { useProgramSignal } from "../audioMeterBus";
import { useAppStore } from "../store/useAppStore";

export default function StreamAudioCheck() {
  const signal = useProgramSignal();
  const mode = useAppStore(state => state.settings.audioMode);
  const gain = useAppStore(state => state.settings.masterAudioGain);
  const stream = useAppStore(state => state.programAudioStream);
  const plugin = useAppStore(state => state.programPlugin);
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState("");
  const ready = stream?.getAudioTracks().some(track => track.readyState === "live" && track.enabled);
  const replacing = plugin?.routing === "replace";
  if (replacing && !plugin.running) {
    const restoreMixer = async () => {
      setRestoring(true);
      setError("");
      try { await window.dualcast.configureAudioPlugin({ action: "routing", routing: "process" }); }
      catch { setError("Could not switch to the mixer. Check the VST controls in Audio Mixer and try again."); }
      finally { setRestoring(false); }
    };
    return <div className="plugin-routing-warning">
      <div role="alert"><strong>Plugin audio is off.</strong> Replace Source Audio is selected. Enable the receiver in Audio Mixer or switch back to your mixer inputs.</div>
      <button type="button" className="btn btn-outline" disabled={restoring} onClick={() => void restoreMixer()}>Use mixer audio</button>
      {error && <p role="alert">{error}</p>}
    </div>;
  }
  let message = "No Program signal. Play a source or speak into a routed input.";
  if (!ready) message = "Waiting for Program audio output.";
  else if (mode === "none") message = "Program is muted. Choose an audio source to send sound.";
  else if (!gain) message = "Program Master is at zero. Raise its fader in Audio Mixer.";
  else if (replacing) {
    const name = plugin.plugins.find(item => item.id === plugin.activeId)?.name || "the replacement plugin";
    message = signal ? `Program is receiving audio from ${name}.` : `No signal from ${name}. Check the plugin input and its sender.`;
  }
  else if (signal) message = "Signal detected in Program.";
  return <p className={`program-signal ${ready && signal && mode !== "none" && gain > 0 ? "has-signal" : ""}`} role="status">{message}</p>;
}

import { useProgramSignal } from "../audioMeterBus";
import { useAppStore } from "../store/useAppStore";

export default function StreamAudioCheck() {
  const signal = useProgramSignal();
  const mode = useAppStore(state => state.settings.audioMode);
  const gain = useAppStore(state => state.settings.masterAudioGain);
  const stream = useAppStore(state => state.programAudioStream);
  const ready = stream?.getAudioTracks().some(track => track.readyState === "live" && track.enabled);
  let message = "No Program signal. Play a source or speak into a routed input.";
  if (!ready) message = "Waiting for Program audio output.";
  else if (mode === "none") message = "Program is muted. Choose an audio source to send sound.";
  else if (!gain) message = "Program Master is at zero. Raise its fader in Audio Mixer.";
  else if (signal) message = "Signal detected in Program.";
  return <p className={`program-signal ${ready && signal && mode !== "none" && gain > 0 ? "has-signal" : ""}`} role="status">{message}</p>;
}

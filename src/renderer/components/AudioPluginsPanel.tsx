import React, { useEffect, useState } from "react";
import { AudioPluginStatus } from "../../shared/audioPlugins";
import "./AudioPluginsPanel.css";

const AudioPluginsPanel: React.FC = () => {
  const [status, setStatus] = useState<AudioPluginStatus | null>(null);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let mounted = true;
    const update = (value: AudioPluginStatus) => {
      if (!mounted) return;
      setStatus(value);
      setSelected(previous => value.activeId ?? (value.plugins.some(plugin => plugin.id === previous) ? previous : value.plugins[0]?.id ?? ""));
    };
    const unsubscribe = window.dualcast.onAudioPluginStatus(update);
    void window.dualcast.getAudioPluginStatus().then(update).catch(reason => { if (mounted) setError(String(reason)); });
    return () => { mounted = false; unsubscribe(); };
  }, []);
  const action = async (operation: "add" | "start" | "stop" | "editor" | "remove") => {
    setBusy(true); setError("");
    try { setStatus(await window.dualcast.configureAudioPlugin({ action: operation, id: selected })); }
    catch (reason) { setError(reason instanceof Error ? reason.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(reason)); }
    finally { setBusy(false); }
  };
  const plugin = status?.plugins.find(item => item.id === selected);
  return <div className="audio-plugins">
    <div className="audio-plugin-heading"><strong>VST audio plugin</strong><span>{status?.running ? "Processing" : "Bypassed"}</span></div>
    <p className="field-help">Apply one Windows 64-bit VST2 effect to Program, recordings and streams. EQ and master volume follow the plugin.</p>
    <div className="audio-plugin-select">
      <label>Plugin from this device<select aria-label="Audio plugin" value={selected} disabled={busy || status?.running || !status?.plugins.length} onChange={event => setSelected(event.target.value)}>
        {!status?.plugins.length && <option value="">No plugins added</option>}
        {status?.plugins.map(item => <option key={item.id} value={item.id}>{item.name}{item.vendor ? ` · ${item.vendor}` : ""}</option>)}
      </select></label>
      <button type="button" className="btn btn-outline" disabled={busy || !status?.supported} onClick={() => void action("add")}>Add VST2 .dll</button>
    </div>
    <div className="audio-plugin-actions">
      <button type="button" className="btn btn-primary" aria-pressed={status?.running ?? false} disabled={busy || !status?.supported || !plugin} onClick={() => void action(status?.running ? "stop" : "start")}>{busy ? "Please wait…" : status?.running ? "Bypass plugin" : "Enable plugin"}</button>
      <button type="button" className="btn btn-outline" disabled={busy || !status?.running || !plugin?.hasEditor} onClick={() => void action("editor")}>Open plugin controls</button>
      <button type="button" className="btn btn-outline" disabled={busy || !plugin || status?.running} onClick={() => void action("remove")}>Remove</button>
    </div>
    <p className="field-help" role="status">{status?.message ?? "Checking audio plugin support…"}</p>
    {plugin && <p className="field-help">48 kHz stereo · bridge latency 43 ms{plugin.latencyFrames > 0 ? ` + plugin ${Math.round(plugin.latencyFrames / 48)} ms` : ""}. Plugin settings are saved on close and bypass.</p>}
    {status?.supported && <p className="field-help">For ReaStream, add its 64-bit DLL, enable it and choose Receive in its controls. Configure the matching stream name and sender there. Native plugins run locally; their files stay on this device. VST3 and 32-bit plugins are not supported.</p>}
    {error && <p className="audio-plugin-error" role="alert">{error}</p>}
  </div>;
};
export default AudioPluginsPanel;

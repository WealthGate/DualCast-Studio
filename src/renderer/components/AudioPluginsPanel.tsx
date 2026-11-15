import React, { useCallback, useEffect, useState } from "react";
import { AudioPluginAction, AudioPluginStatus } from "../../shared/audioPlugins";
import "./AudioPluginsPanel.css";

const AudioPluginsPanel: React.FC = () => {
  const [status, setStatus] = useState<AudioPluginStatus | null>(null);
  const [selected, setSelected] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const applyStatus = useCallback((value: AudioPluginStatus) => {
    setStatus(value);
    setSelected(previous => value.activeId ?? (value.plugins.some(plugin => plugin.id === previous) ? previous : value.plugins[0]?.id ?? ""));
  }, []);
  useEffect(() => {
    let mounted = true;
    const update = (value: AudioPluginStatus) => {
      if (!mounted) return;
      applyStatus(value);
    };
    const unsubscribe = window.dualcast.onAudioPluginStatus(update);
    void window.dualcast.getAudioPluginStatus().then(update).catch(reason => { if (mounted) setError(String(reason)); });
    return () => { mounted = false; unsubscribe(); };
  }, [applyStatus]);
  const action = async (operation: AudioPluginAction["action"], routing?: AudioPluginAction["routing"]) => {
    setBusy(true); setError("");
    try {
      const next = await window.dualcast.configureAudioPlugin({ action: operation, id: selected, routing });
      applyStatus(next);
      if (operation === "start" && next.running && next.plugins.find(item => item.id === next.activeId)?.hasEditor)
        applyStatus(await window.dualcast.configureAudioPlugin({ action: "editor" }));
    }
    catch (reason) { setError(reason instanceof Error ? reason.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, "") : String(reason)); }
    finally { setBusy(false); }
  };
  const plugin = status?.plugins.find(item => item.id === selected);
  return <div className="audio-plugins">
    <div className="audio-plugin-heading"><strong>VST audio plugin</strong><span>{status?.running ? "Processing" : "Bypassed"}</span></div>
    <p className="field-help">Use a Windows x64 VST2 or VST3 effect for Program, recordings and streams.</p>
    <div className="audio-plugin-actions">
      <button type="button" className="btn btn-outline" disabled={busy || !status?.supported} onClick={() => void action("scan")}>Scan installed VST plugins</button>
      <button type="button" className="btn btn-outline" disabled={busy || !status?.supported} onClick={() => void action("scan-folder")}>Scan folder…</button>
    </div>
    <div className="audio-plugin-select">
      <label>Plugin from this device<select aria-label="Audio plugin" value={selected} disabled={busy || status?.running || !status?.plugins.length} onChange={event => setSelected(event.target.value)}>
        {!status?.plugins.length && <option value="">No plugins added</option>}
        {status?.plugins.map(item => <option key={item.id} value={item.id}>{item.name} · {item.format.toUpperCase()}{item.vendor ? ` · ${item.vendor}` : ""}{item.available === false ? " · File missing" : ""}</option>)}
      </select></label>
      <button type="button" className="btn btn-outline" disabled={busy || !status?.supported} onClick={() => void action("add")}>Add plugin file</button>
    </div>
    {status?.supported && <label>Program audio routing
      <select aria-label="Program audio routing" value={status.routing ?? "process"} disabled={busy || status.running}
        onChange={event => void action("routing", event.target.value === "replace" ? "replace" : "process")}>
        <option value="process">Process Source Audio</option>
        <option value="replace">Replace Source Audio</option>
      </select>
    </label>}
    {status?.routing === "replace" && <p className="field-help">Program takes audio only from the plugin. Program stays silent if the plugin is stopped or has no audio.</p>}
    <div className="audio-plugin-actions">
      <button type="button" className="btn btn-primary" aria-pressed={status?.running ?? false} disabled={busy || (!status?.running && (!status?.supported || !plugin || plugin.available === false))} onClick={() => void action(status?.running ? "stop" : "start")}>{busy ? "Please wait…" : status?.running ? "Bypass plugin" : "Enable plugin"}</button>
      <button type="button" className="btn btn-outline" disabled={busy || !status?.running || !plugin?.hasEditor} onClick={() => void action("editor")}>Open plugin controls</button>
      <button type="button" className="btn btn-outline" disabled={busy || !plugin || status?.running} onClick={() => void action("remove")}>Remove</button>
    </div>
    <p className="field-help" role="status">{status?.message ?? "Checking audio plugin support…"}</p>
    {plugin?.available === false && <p className="audio-plugin-error">This plugin file has moved or was removed. Scan its current folder or remove this entry and add the installed DLL again.</p>}
    {status?.scan && status.scan.issues.length > 0 && <details className="audio-plugin-scan-results"><summary>Scan details ({status.scan.issues.length}{status.scan.issues.length >= 20 ? "+" : ""})</summary><ul>{status.scan.issues.map((issue, index) => <li key={index}>{issue}</li>)}</ul></details>}
    {plugin && <p className="field-help">48 kHz stereo · bridge latency 43 ms{plugin.latencyFrames > 0 ? ` + plugin ${Math.round(plugin.latencyFrames / 48)} ms` : ""}. Plugin settings are saved on close and bypass.</p>}
    {status?.supported && <p className="field-help">For ReaStream, select Replace Source Audio, then enable ReaStream. In its controls, turn on Enable audio/MIDI, select Receive audio/MIDI, and match the sender’s identifier. Keep the Program master unmuted.</p>}
    {error && <p className="audio-plugin-error" role="alert">{error}</p>}
  </div>;
};
export default AudioPluginsPanel;

import React, { useEffect, useMemo, useState } from "react";
import { StreamingEncoder } from "../../shared/types";
import { useAppStore } from "../store/useAppStore";
import { recommendAutoConfiguration } from "../utils/autoConfiguration";
import { getStreamingEncoderOption } from "../../shared/streamingEncoders";

type AutoConfigurationWizardProps = { onClose: () => void };

const AutoConfigurationWizard: React.FC<AutoConfigurationWizardProps> = ({ onClose }) => {
  const { updateSettings } = useAppStore();
  const [useCase, setUseCase] = useState<"stream-first" | "record-first" | "balanced">("stream-first");
  const [uploadMbps, setUploadMbps] = useState(10);
  const [motion, setMotion] = useState<"normal" | "high">("normal");
  const [encoders, setEncoders] = useState<StreamingEncoder[]>(["x264"]);
  const [message, setMessage] = useState("Testing the encoders installed on this computer…");

  useEffect(() => {
    window.dualcast.getStreamingCapabilities().then((capabilities) => {
      setEncoders(capabilities.encoders);
      setMessage(`${capabilities.encoders.length} compatible encoder${capabilities.encoders.length === 1 ? "" : "s"} tested.`);
    }).catch(() => setMessage("Encoder test was unavailable; software x264 will remain selected."));
  }, []);

  const recommendation = useMemo(() => recommendAutoConfiguration({ useCase, uploadMbps, motion, encoders }), [encoders, motion, uploadMbps, useCase]);

  const apply = async () => {
    await updateSettings({
      streamPreset: recommendation.streamPreset,
      streamFps: recommendation.streamFps,
      streamAudioBitrate: recommendation.streamAudioBitrate,
      streamEncoder: recommendation.streamEncoder,
      qualityPreset: recommendation.qualityPreset,
      frameRate: recommendation.streamFps
    });
    onClose();
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="studio-modal auto-config-wizard" role="dialog" aria-modal="true" aria-labelledby="auto-config-title">
        <div className="panel-header"><div><h2 id="auto-config-title">Auto-Configuration Wizard</h2><p>Choose the priority and enter the tested upload speed at this venue.</p></div><button className="btn btn-outline" onClick={onClose}>Cancel</button></div>
        <div className="wizard-options">
          <fieldset><legend>How will you use OpenChurch most?</legend>
            <label><input type="radio" name="useCase" checked={useCase === "stream-first"} onChange={() => setUseCase("stream-first")} /> Streaming first; recording is secondary</label>
            <label><input type="radio" name="useCase" checked={useCase === "balanced"} onChange={() => setUseCase("balanced")} /> Streaming and recording equally</label>
            <label><input type="radio" name="useCase" checked={useCase === "record-first"} onChange={() => setUseCase("record-first")} /> Recording quality first</label>
          </fieldset>
          <div className="field"><label htmlFor="uploadSpeed">Stable upload speed (Mbps)</label><input id="uploadSpeed" type="number" min={0.5} max={1000} step={0.5} value={uploadMbps} onChange={(event) => setUploadMbps(Number(event.target.value))} /><span className="field-help">Use a wired connection and enter a conservative result, not the highest short burst.</span></div>
          <div className="field"><label htmlFor="motionLevel">Typical movement</label><select id="motionLevel" value={motion} onChange={(event) => setMotion(event.target.value as "normal" | "high")}><option value="normal">Sermon / normal worship movement</option><option value="high">Fast stage movement / sports-like motion</option></select></div>
        </div>
        <div className="wizard-result">
          <h3>Recommended Setup</h3>
          <div className="configuration-summary">
            <span><strong>Stream</strong>{recommendation.streamPreset} · {recommendation.streamFps} fps</span>
            <span><strong>Encoder</strong>{recommendation.streamEncoder === "auto" ? "Auto" : getStreamingEncoderOption(recommendation.streamEncoder)?.label ?? recommendation.streamEncoder}</span>
            <span><strong>Audio</strong>{recommendation.streamAudioBitrate} kbps</span>
            <span><strong>Recording</strong>{recommendation.qualityPreset}</span>
          </div>
          <p>{recommendation.explanation}</p><p className="field-help">{message}</p>
        </div>
        <div className="modal-actions"><button className="btn btn-primary" onClick={() => void apply()}>Apply Recommended Settings</button><button className="btn btn-outline" onClick={onClose}>Keep Current Settings</button></div>
      </section>
    </div>
  );
};

export default AutoConfigurationWizard;

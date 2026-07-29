import React, { useState } from "react";
import { MediaFileResult } from "../../shared/types";

const EditorPanel: React.FC = () => {
  const [media, setMedia] = useState<MediaFileResult | null>(null);
  const [startSeconds, setStartSeconds] = useState(0);
  const [endSeconds, setEndSeconds] = useState(60);
  const [message, setMessage] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [outputPath, setOutputPath] = useState<string | null>(null);

  const selectRecording = async () => {
    const result = await window.dualcast.selectMediaFile({ kind: "video" });
    if (result) {
      setMedia(result);
      setMessage(null);
      setOutputPath(null);
    }
  };

  const handleExport = async () => {
    if (!media) {
      setMessage("Select a recording first.");
      return;
    }
    setExporting(true);
    setMessage(null);
    try {
      const result = await window.dualcast.exportClip({
        inputPath: media.filePath,
        startSeconds,
        endSeconds
      });
      setOutputPath(result.filePath);
      setMessage(`Exported ${result.fileName}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Clip export failed.");
    } finally {
      setExporting(false);
    }
  };

  return (
    <section className="panel editor-panel">
      <div className="panel-header">
        <h2>Post-Production Editor</h2>
        <span className="tag">Trim & Export</span>
      </div>
      <div className="field">
        <label>Recording</label>
        <div className="field-row">
          <span className="path">{media?.name ?? "No recording selected"}</span>
          <button className="btn btn-outline" onClick={selectRecording}>
            Choose Video
          </button>
        </div>
      </div>
      <div className="field-grid">
        <div className="field">
          <label htmlFor="clipStart">Start (seconds)</label>
          <input
            id="clipStart"
            type="number"
            min={0}
            step={0.1}
            value={startSeconds}
            onChange={(event) => setStartSeconds(Number(event.target.value))}
          />
        </div>
        <div className="field">
          <label htmlFor="clipEnd">End (seconds)</label>
          <input
            id="clipEnd"
            type="number"
            min={0.1}
            step={0.1}
            value={endSeconds}
            onChange={(event) => setEndSeconds(Number(event.target.value))}
          />
        </div>
      </div>
      <button className="btn btn-primary" onClick={handleExport} disabled={!media || exporting}>
        {exporting ? "Exporting…" : "Export MP4 Clip"}
      </button>
      {message ? <div className="info-pill">{message}</div> : null}
      {outputPath ? (
        <button className="btn btn-outline" onClick={() => window.dualcast.openFolder(outputPath)}>
          Show Exported Clip
        </button>
      ) : null}
      <p className="panel-note">
        This first editor module trims a recording and exports a new H.264/AAC MP4. Timeline titles and multi-track
        editing remain future modules.
      </p>
    </section>
  );
};

export default EditorPanel;

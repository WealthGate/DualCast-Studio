import React, { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";

const DisplayPicker: React.FC = () => {
  const { displays, previewSourceId, refreshDisplays, setPreviewSourceId } = useAppStore();
  const [expanded, setExpanded] = useState<"screen" | "window" | null>(null);

  useEffect(() => {
    refreshDisplays();
  }, [refreshDisplays]);

  const screens = useMemo(() => displays.filter((display) => display.sourceType === "screen"), [displays]);
  const windows = useMemo(() => displays.filter((display) => display.sourceType === "window"), [displays]);

  const toggleSection = (section: "screen" | "window") => {
    setExpanded((current) => (current === section ? null : section));
  };

  return (
    <section className="panel display-panel">
      <div className="panel-header">
        <h2>Displays</h2>
        <button className="btn btn-outline" onClick={refreshDisplays}>
          Refresh
        </button>
      </div>
      <div className="source-tabs">
        <button className={`tab-btn ${expanded === "screen" ? "active" : ""}`} onClick={() => toggleSection("screen")}>
          Screens
          <span className="count-pill">{screens.length}</span>
        </button>
        <button className={`tab-btn ${expanded === "window" ? "active" : ""}`} onClick={() => toggleSection("window")}>
          Windows
          <span className="count-pill">{windows.length}</span>
        </button>
      </div>
      {expanded === "screen" ? (
        <div className="display-grid">
          {screens.map((display) => (
            <button
              key={display.id}
              className={`display-card ${previewSourceId === display.id ? "selected" : ""}`}
              onClick={() => setPreviewSourceId(display.id)}
            >
              <img src={display.thumbnailUrl} alt={display.name} />
              <div className="display-meta">
                <span className="display-name">{display.name}</span>
                <span className="display-res">
                  {display.size.width} x {display.size.height}
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : null}
      {expanded === "window" ? (
        <div className="display-grid">
          {windows.map((display) => (
            <button
              key={display.id}
              className={`display-card ${previewSourceId === display.id ? "selected" : ""}`}
              onClick={() => setPreviewSourceId(display.id)}
            >
              <img src={display.thumbnailUrl} alt={display.name} />
              <div className="display-meta">
                <span className="display-name">{display.name}</span>
                <span className="display-res">
                  {display.size.width} x {display.size.height}
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
};

export default DisplayPicker;

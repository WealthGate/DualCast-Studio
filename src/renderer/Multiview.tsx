import React, { useEffect, useRef, useState } from "react";
import { MultiviewPayload, MultiviewTile } from "../shared/types";

const emptyPayload: MultiviewPayload = {
  previewSceneId: null,
  programSceneId: null,
  tiles: []
};

const Multiview: React.FC = () => {
  const [payload, setPayload] = useState(emptyPayload);
  const clickTimerRef = useRef<number | null>(null);

  useEffect(() => {
    document.body.classList.add("multiview-mode");
    const unsubscribe = window.dualcast.onMultiviewData(setPayload);
    return () => {
      document.body.classList.remove("multiview-mode");
      unsubscribe();
      if (clickTimerRef.current !== null) {
        window.clearTimeout(clickTimerRef.current);
      }
    };
  }, []);

  const sendAction = (tile: MultiviewTile, action: "preview" | "program") => {
    window.dualcast.sendMultiviewAction({ sceneId: tile.sceneId, action });
  };

  const handleClick = (tile: MultiviewTile) => {
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current);
    }
    clickTimerRef.current = window.setTimeout(() => {
      sendAction(tile, "preview");
      clickTimerRef.current = null;
    }, 240);
  };

  const handleDoubleClick = (tile: MultiviewTile) => {
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
    sendAction(tile, "program");
  };

  return (
    <main className="multiview-root">
      <header className="multiview-header">
        <div>
          <h1>OpenChurch Multiview</h1>
          <p>All configured scenes and connected camera sources</p>
        </div>
        <div className="multiview-help">
          <span><b>Click</b> Preview</span>
          <span><b>Double-click</b> Program</span>
        </div>
      </header>
      {payload.tiles.length > 0 ? (
        <section className="multiview-grid">
          {payload.tiles.map((tile) => {
            const isProgram = payload.programSceneId === tile.sceneId;
            const isPreview = payload.previewSceneId === tile.sceneId;
            return (
              <button
                key={tile.id}
                className={`multiview-tile${isProgram ? " is-program" : ""}${isPreview ? " is-preview" : ""}`}
                onClick={() => handleClick(tile)}
                onDoubleClick={() => handleDoubleClick(tile)}
                title={`${tile.name}: click for Preview, double-click for Program`}
              >
                <span className="multiview-frame">
                  {tile.dataUrl ? <img src={tile.dataUrl} alt="" draggable={false} /> : <span className="multiview-no-signal">No signal</span>}
                  <span className={`multiview-kind ${tile.kind}`}>{tile.kind}</span>
                  {isProgram ? <span className="multiview-status program">PROGRAM</span> : null}
                  {!isProgram && isPreview ? <span className="multiview-status preview">PREVIEW</span> : null}
                </span>
                <span className="multiview-label">
                  <strong>{tile.name}</strong>
                  <small>{tile.subtitle ?? (tile.kind === "scene" ? "Scene" : "Camera")}</small>
                </span>
              </button>
            );
          })}
        </section>
      ) : (
        <section className="multiview-empty">
          <strong>Waiting for studio sources</strong>
          <span>Keep the main studio window open to populate Multiview.</span>
        </section>
      )}
    </main>
  );
};

export default Multiview;

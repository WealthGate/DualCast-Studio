import React, { useEffect, useMemo } from "react";
import { useAppStore } from "../store/useAppStore";

const SanctuaryDisplaysPanel: React.FC = () => {
  const {
    displays,
    programSceneId,
    settings,
    isProjecting,
    isLowerThirdProjecting,
    projectionTargetIds,
    setIsProjecting,
    setIsLowerThirdProjecting,
    setProjectionTargetIds,
    updateSettings
  } = useAppStore();

  const screenTargets = useMemo(
    () => displays.filter((display) => display.sourceType === "screen" && display.displayId),
    [displays]
  );

  useEffect(() => {
    if (projectionTargetIds.length === 0 && screenTargets.length > 0) {
      setProjectionTargetIds([String(screenTargets[0].displayId)]);
    }
  }, [projectionTargetIds.length, screenTargets, setProjectionTargetIds]);

  const handleProjectionToggle = async () => {
    if (isProjecting) {
      await window.dualcast.closeProjection();
      setIsProjecting(false);
      return;
    }
    await window.dualcast.openProjection(projectionTargetIds);
    setIsProjecting(true);
  };

  const handleProjectionTargetToggle = (displayId: string, checked: boolean) => {
    setProjectionTargetIds(
      checked
        ? Array.from(new Set([...projectionTargetIds, displayId]))
        : projectionTargetIds.filter((id) => id !== displayId)
    );
  };

  const handleLowerThirdToggle = async () => {
    if (isLowerThirdProjecting) {
      await window.dualcast.closeLowerThird();
      setIsLowerThirdProjecting(false);
      await updateSettings({
        lowerThird: { ...settings.lowerThird, enabled: false }
      });
      return;
    }
    const displayId = settings.lowerThird.displayId;
    if (!displayId) {
      return;
    }
    await window.dualcast.openLowerThird(displayId);
    setIsLowerThirdProjecting(true);
    await updateSettings({
      lowerThird: { ...settings.lowerThird, enabled: true }
    });
  };

  return (
    <div className="compact-dock-panel sanctuary-displays-panel">
      <div className="display-target-grid">
        {screenTargets.length === 0 ? <div className="empty-hint">No sanctuary displays detected.</div> : null}
        {screenTargets.map((display) => {
          const displayId = String(display.displayId);
          return (
            <label key={display.displayId ?? display.id} className="display-target-option">
              <input
                type="checkbox"
                checked={projectionTargetIds.includes(displayId)}
                onChange={(event) => handleProjectionTargetToggle(displayId, event.target.checked)}
                disabled={isProjecting}
              />
              <span>{display.name} ({display.size.width} × {display.size.height})</span>
            </label>
          );
        })}
      </div>
      <button
        className="btn btn-primary"
        onClick={handleProjectionToggle}
        disabled={!programSceneId || screenTargets.length === 0 || projectionTargetIds.length === 0}
      >
        {isProjecting ? "Stop Projection" : "Project Program"}
      </button>
      <div className="lower-third-dock-section">
        <label htmlFor="lowerThirdDisplay">Lower-third screen</label>
        <select
          id="lowerThirdDisplay"
          value={settings.lowerThird.displayId ?? ""}
          onChange={(event) => updateSettings({
            lowerThird: { ...settings.lowerThird, displayId: event.target.value || null }
          })}
          disabled={isLowerThirdProjecting}
        >
          <option value="">Choose display...</option>
          {screenTargets.map((display) => (
            <option key={`lower-${display.displayId ?? display.id}`} value={String(display.displayId)}>
              {display.name}
            </option>
          ))}
        </select>
        <button className="btn btn-outline" onClick={handleLowerThirdToggle} disabled={!settings.lowerThird.displayId}>
          {isLowerThirdProjecting ? "Stop Lower Third" : "Start Lower Third"}
        </button>
      </div>
    </div>
  );
};

export default SanctuaryDisplaysPanel;

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { ProjectionDisplay } from "../../shared/types";

const SanctuaryDisplaysPanel: React.FC = () => {
  const {
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
  const [projectionDisplays, setProjectionDisplays] = useState<ProjectionDisplay[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(true);
  const [displayError, setDisplayError] = useState<string | null>(null);

  const refreshProjectionDisplays = useCallback(async () => {
    setIsRefreshing(true);
    try {
      setProjectionDisplays(await window.dualcast.listProjectionDisplays());
      setDisplayError(null);
    } catch (error) {
      setDisplayError(error instanceof Error ? error.message : "Displays could not be detected.");
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refreshProjectionDisplays();
    const unsubscribe = window.dualcast.onProjectionDisplaysChanged(() => void refreshProjectionDisplays());
    const handleFocus = () => void refreshProjectionDisplays();
    window.addEventListener("focus", handleFocus);
    return () => {
      unsubscribe();
      window.removeEventListener("focus", handleFocus);
    };
  }, [refreshProjectionDisplays]);

  const displayIds = useMemo(() => new Set(projectionDisplays.map((display) => display.id)), [projectionDisplays]);

  useEffect(() => {
    const validTargets = projectionTargetIds.filter((displayId) => displayIds.has(displayId));
    if (validTargets.length !== projectionTargetIds.length) {
      setProjectionTargetIds(validTargets);
    } else if (validTargets.length === 0 && projectionDisplays.length > 0) {
      const preferred = projectionDisplays.find((display) => !display.isPrimary) ?? projectionDisplays[0];
      setProjectionTargetIds([preferred.id]);
    }
  }, [displayIds, projectionDisplays, projectionTargetIds, setProjectionTargetIds]);

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

  const lowerThirdDisplayId = settings.lowerThird.displayId;
  const validLowerThirdDisplayId = lowerThirdDisplayId && displayIds.has(lowerThirdDisplayId)
    ? lowerThirdDisplayId
    : "";

  return (
    <div className="compact-dock-panel sanctuary-displays-panel">
      <div className="display-target-toolbar">
        <strong>Connected displays</strong>
        <button className="btn btn-outline btn-compact" onClick={() => void refreshProjectionDisplays()} disabled={isRefreshing}>
          {isRefreshing ? "Detecting…" : "Refresh"}
        </button>
      </div>
      <div className="display-target-grid">
        {!isRefreshing && projectionDisplays.length === 0 ? <div className="empty-hint">No displays detected. Check the Windows display connection, then choose Refresh.</div> : null}
        {displayError ? <div className="empty-hint">{displayError}</div> : null}
        {projectionDisplays.map((display) => {
          const displayId = display.id;
          return (
            <label key={display.id} className="display-target-option">
              <input
                type="checkbox"
                checked={projectionTargetIds.includes(displayId)}
                onChange={(event) => handleProjectionTargetToggle(displayId, event.target.checked)}
                disabled={isProjecting}
              />
              <span>{display.name}{display.isPrimary ? " (Primary)" : ""} · {display.size.width} × {display.size.height}</span>
            </label>
          );
        })}
      </div>
      <button
        className="btn btn-primary"
        onClick={handleProjectionToggle}
        disabled={!isProjecting && (!programSceneId || projectionDisplays.length === 0 || projectionTargetIds.length === 0)}
      >
        {isProjecting ? "Stop Projection" : "Project Program"}
      </button>
      <div className="lower-third-dock-section">
        <label htmlFor="lowerThirdDisplay">Lower-third screen</label>
        <select
          id="lowerThirdDisplay"
          value={validLowerThirdDisplayId}
          onChange={(event) => updateSettings({
            lowerThird: { ...settings.lowerThird, displayId: event.target.value || null }
          })}
          disabled={isLowerThirdProjecting}
        >
          <option value="">Choose display...</option>
          {projectionDisplays.map((display) => (
            <option key={`lower-${display.id}`} value={display.id}>
              {display.name}{display.isPrimary ? " (Primary)" : ""}
            </option>
          ))}
        </select>
        <button className="btn btn-outline" onClick={handleLowerThirdToggle} disabled={!isLowerThirdProjecting && !validLowerThirdDisplayId}>
          {isLowerThirdProjecting ? "Stop Lower Third" : "Start Lower Third"}
        </button>
      </div>
    </div>
  );
};

export default SanctuaryDisplaysPanel;

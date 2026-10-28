import SanctuaryLayoutEditor from "./SanctuaryLayoutEditor";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { useConnectedDisplays } from "../store/useConnectedDisplays";
import { modeForDisplay } from "../../shared/displayBackgroundState";

const SanctuaryDisplaysPanel: React.FC<{ onOpenBackgrounds?: () => void }> = ({ onOpenBackgrounds }) => {
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
  const { displays: projectionDisplays, loading: isRefreshing, error: detectionError, refresh: refreshProjectionDisplays } = useConnectedDisplays();
  const initializedSelection = useRef(false);
  const [displayError, setDisplayError] = useState<string | null>(null);

  const displayIds = useMemo(() => new Set(projectionDisplays.map((display) => display.id)), [projectionDisplays]);

  useEffect(() => {
    if (isRefreshing || detectionError) return;
    const validTargets = projectionTargetIds.filter((displayId) => displayIds.has(displayId));
    if (validTargets.length !== projectionTargetIds.length) {
      setProjectionTargetIds(validTargets);
    } else if (!initializedSelection.current && validTargets.length === 0 && projectionDisplays.length > 0) {
      const preferred = projectionDisplays.find((display) => !display.isPrimary) ?? projectionDisplays[0];
      setProjectionTargetIds([preferred.id]);
    }
    if (projectionDisplays.length) initializedSelection.current = true;
  }, [displayIds, projectionDisplays, projectionTargetIds, setProjectionTargetIds, isRefreshing, detectionError]);

  const handleProjectionToggle = async () => {
    try {
      if (isProjecting) {
        await window.dualcast.closeProjection();
        setIsProjecting(false);
        return;
      }
      const opened = await window.dualcast.openProjection(projectionTargetIds);
      setIsProjecting(opened);
      setDisplayError(opened ? null : "The sanctuary display could not be opened.");
    } catch (error) {
      setDisplayError(error instanceof Error ? error.message : "The sanctuary display could not be updated.");
    }
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
        {displayError || detectionError ? <div className="empty-hint" role="alert">{displayError || detectionError}</div> : null}
        {projectionDisplays.map((display, index) => {
          const displayId = display.id;
          return (
            <label key={display.id} className="display-target-option">
              <input
                type="checkbox"
                value={displayId}
                checked={projectionTargetIds.includes(displayId)}
                onChange={(event) => handleProjectionTargetToggle(displayId, event.target.checked)}
                disabled={isProjecting}
              />
              <span>Screen {index + 1} · {display.name}{display.isPrimary ? " (Primary / operator)" : ""} · {display.size.width} × {display.size.height}</span>
            </label>
          );
        })}
      </div>
      <button
        className="btn btn-primary"
        onClick={handleProjectionToggle}
        disabled={!isProjecting && ((!projectionTargetIds.some(id => modeForDisplay(settings.sanctuaryDisplay, settings.displayBackgrounds, id) === "independent") && !programSceneId && !settings.displayBackgrounds?.program) || projectionDisplays.length === 0 || projectionTargetIds.length === 0)}
      >
        {isProjecting ? "Stop Projection" : "Show selected screens"}
      </button>
      <SanctuaryLayoutEditor onOpenBackgrounds={onOpenBackgrounds} />
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
          {projectionDisplays.map((display, index) => (
            <option key={`lower-${display.id}`} value={display.id}>
              Screen {index + 1} · {display.name}{display.isPrimary ? " (Primary / operator)" : ""}
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

import React, { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { Source, SourceRect, SourceType } from "../../shared/types";

type CameraDevice = {
  deviceId: string;
  label: string;
};

const hasAudioToggle = (type: SourceType) => ["display", "window", "video", "audio"].includes(type);

const defaultRect = { x: 10, y: 10, width: 50, height: 50 };
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const parseNumber = (value: string, fallback: number) => {
  const next = Number(value);
  return Number.isFinite(next) ? next : fallback;
};

const SceneSourcesPanel: React.FC = () => {
  const {
    scenes,
    sources,
    previewSceneId,
    selectedSourceId,
    displays,
    settings,
    groups,
    addScene,
    renameScene,
    removeScene,
    toggleSceneLocked,
    selectPreviewScene,
    addSourceToScene,
    removeSourceFromScene,
    moveSourceInScene,
    updateSourceRect,
    updateSource,
    toggleSourceEnabled,
    toggleSourceAudio,
    toggleSourceLocked,
    setSourceGroup,
    addGroup,
    renameGroup,
    removeGroup,
    setSourceMediaPaused,
    restartSourceMedia,
    setSelectedSourceId,
    persistStudioState
  } = useAppStore();

  const [sourceType, setSourceType] = useState<SourceType>("display");
  const [sourceName, setSourceName] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceText, setSourceText] = useState("Edit this live text");
  const [captureId, setCaptureId] = useState("");
  const [cameraId, setCameraId] = useState("");
  const [cameras, setCameras] = useState<CameraDevice[]>([]);
  const [newGroupName, setNewGroupName] = useState("");

  const activeScene = useMemo(() => scenes.find((scene) => scene.id === previewSceneId) ?? scenes[0], [previewSceneId, scenes]);
  const sceneSources = activeScene ? activeScene.sourceIds.map((id) => sources[id]).filter(Boolean) : [];
  const selectedSource = selectedSourceId ? sources[selectedSourceId] ?? null : null;
  const activeSceneLocked = Boolean(activeScene?.locked);
  const groupMap = useMemo(() => new Map(groups.map((group) => [group.id, group])), [groups]);

  useEffect(() => {
    const refreshCameras = async () => {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameraDevices = devices
        .filter((device) => device.kind === "videoinput")
        .map((device, index) => ({
          deviceId: device.deviceId,
          label: device.label || `Camera ${index + 1}`
        }));
      setCameras(cameraDevices);
    };
    refreshCameras();
  }, []);

  const handleAddScene = async () => {
    addScene();
    await persistStudioState();
  };

  const handleRenameScene = async (value: string) => {
    if (!activeScene || activeScene.locked) {
      return;
    }
    renameScene(activeScene.id, value);
    await persistStudioState();
  };

  const handleRemoveScene = async () => {
    if (!activeScene || scenes.length <= 1 || activeScene.locked) {
      return;
    }
    removeScene(activeScene.id);
    await persistStudioState();
  };

  const handleSelectScene = async (sceneId: string) => {
    selectPreviewScene(sceneId);
    await persistStudioState();
  };

  const handlePickFile = async () => {
    const kind = sourceType === "image" || sourceType === "video" || sourceType === "audio" ? sourceType : null;
    if (!kind) {
      return;
    }
    const result = await window.dualcast.selectMediaFile({ kind });
    if (!result) {
      return;
    }
    setSourceUrl(result.fileUrl);
    if (!sourceName) {
      setSourceName(result.name);
    }
  };

  const handleAddSource = async () => {
    if (!activeScene || activeScene.locked) {
      return;
    }
    let source: Omit<Source, "id"> | null = null;
    if (sourceType === "display" || sourceType === "window") {
      if (!captureId) {
        return;
      }
      source = {
        type: sourceType,
        name: sourceName || `${sourceType === "display" ? "Display" : "Window"} ${sceneSources.length + 1}`,
        rect: defaultRect,
        enabled: true,
        audioEnabled: false,
        volume: 1,
        data: { captureId }
      };
    } else if (sourceType === "camera") {
      if (!cameraId) {
        return;
      }
      source = {
        type: sourceType,
        name: sourceName || `Camera ${sceneSources.length + 1}`,
        rect: defaultRect,
        enabled: true,
        audioEnabled: false,
        volume: 1,
        data: { deviceId: cameraId }
      };
    } else if (sourceType === "image") {
      if (!sourceUrl) {
        return;
      }
      source = {
        type: sourceType,
        name: sourceName || `Image ${sceneSources.length + 1}`,
        rect: defaultRect,
        enabled: true,
        audioEnabled: false,
        volume: 1,
        data: { url: sourceUrl }
      };
    } else if (sourceType === "video") {
      if (!sourceUrl) {
        return;
      }
      source = {
        type: sourceType,
        name: sourceName || `Video ${sceneSources.length + 1}`,
        rect: defaultRect,
        enabled: true,
        audioEnabled: true,
        volume: 1,
        data: { url: sourceUrl, loop: true }
      };
    } else if (sourceType === "audio") {
      if (!sourceUrl) {
        return;
      }
      source = {
        type: sourceType,
        name: sourceName || `Audio ${sceneSources.length + 1}`,
        rect: { x: 0, y: 0, width: 0, height: 0 },
        enabled: true,
        audioEnabled: true,
        volume: 1,
        data: { url: sourceUrl, loop: true }
      };
    } else if (sourceType === "browser") {
      if (!sourceUrl) {
        return;
      }
      source = {
        type: sourceType,
        name: sourceName || `Browser ${sceneSources.length + 1}`,
        rect: defaultRect,
        enabled: true,
        audioEnabled: false,
        volume: 1,
        data: { url: sourceUrl }
      };
    } else if (sourceType === "text") {
      source = {
        type: sourceType,
        name: sourceName || `Text ${sceneSources.length + 1}`,
        rect: { x: 15, y: 15, width: 70, height: 18 },
        enabled: true,
        audioEnabled: false,
        volume: 1,
        data: {
          text: sourceText || "Live text",
          fontSize: 48,
          color: "#ffffff",
          backgroundColor: "rgba(0,0,0,0.45)",
          align: "center",
          role: "standard"
        }
      };
    }

    if (!source) {
      return;
    }

    addSourceToScene(activeScene.id, source);
    setSourceName("");
    if (sourceType !== "display" && sourceType !== "window" && sourceType !== "camera") {
      setSourceUrl("");
    }
    if (sourceType === "text") {
      setSourceText("Edit this live text");
    }
    await persistStudioState();
  };

  const handleMove = async (sourceId: string, direction: -1 | 1) => {
    if (!activeScene || activeScene.locked) {
      return;
    }
    moveSourceInScene(activeScene.id, sourceId, direction);
    await persistStudioState();
  };

  const handleToggleEnabled = async (sourceId: string) => {
    if (activeSceneLocked) {
      return;
    }
    toggleSourceEnabled(sourceId);
    await persistStudioState();
  };

  const handleToggleAudio = async (sourceId: string) => {
    if (activeSceneLocked) {
      return;
    }
    toggleSourceAudio(sourceId);
    await persistStudioState();
  };

  const handleRemoveSource = async (sourceId: string) => {
    if (!activeScene || activeScene.locked) {
      return;
    }
    removeSourceFromScene(activeScene.id, sourceId);
    await persistStudioState();
  };

  const handleToggleSceneLock = async () => {
    if (!activeScene) {
      return;
    }
    toggleSceneLocked(activeScene.id);
    await persistStudioState();
  };

  const handleSourceNameChange = async (value: string) => {
    if (!selectedSource) {
      return;
    }
    updateSource(selectedSource.id, { name: value });
    await persistStudioState();
  };

  const handleSourceUrlChange = async (value: string) => {
    if (
      !selectedSource ||
      (selectedSource.type !== "image" &&
        selectedSource.type !== "video" &&
        selectedSource.type !== "audio" &&
        selectedSource.type !== "browser")
    ) {
      return;
    }
    updateSource(selectedSource.id, { data: { ...selectedSource.data, url: value } });
    await persistStudioState();
  };

  const handleTextSourceChange = async (
    update: Partial<Extract<Source, { type: "text" }>["data"]>
  ) => {
    if (!selectedSource || selectedSource.type !== "text") {
      return;
    }
    updateSource(selectedSource.id, { data: { ...selectedSource.data, ...update } });
    await persistStudioState();
  };

  const handleTextRoleChange = async (role: "standard" | "lower-third") => {
    if (!selectedSource || selectedSource.type !== "text") {
      return;
    }
    updateSource(selectedSource.id, {
      data: { ...selectedSource.data, role },
      rect:
        role === "lower-third"
          ? {
              x: 8,
              y:
                settings.lowerThird.position === "bottom"
                  ? 100 - settings.lowerThird.heightPercent
                  : 0,
              width: 84,
              height: settings.lowerThird.heightPercent
            }
          : selectedSource.rect
    });
    await persistStudioState();
  };

  const handleVolumeChange = async (value: number) => {
    if (!selectedSource) {
      return;
    }
    updateSource(selectedSource.id, { volume: clamp(value, 0, 2) });
    await persistStudioState();
  };

  const handleTransformChange = async (nextRect: Partial<SourceRect>, rotation?: number) => {
    if (!selectedSource || selectedSource.locked) {
      return;
    }
    if (nextRect.x !== undefined || nextRect.y !== undefined || nextRect.width !== undefined || nextRect.height !== undefined) {
      const rect = {
        x: clamp(nextRect.x ?? selectedSource.rect.x, 0, 100),
        y: clamp(nextRect.y ?? selectedSource.rect.y, 0, 100),
        width: clamp(nextRect.width ?? selectedSource.rect.width, 2, 100),
        height: clamp(nextRect.height ?? selectedSource.rect.height, 2, 100)
      };
      updateSourceRect(selectedSource.id, rect);
    }
    if (typeof rotation === "number") {
      updateSource(selectedSource.id, { rotation });
    }
    await persistStudioState();
  };

  const handleAssignGroup = async (groupId: string | null) => {
    if (!selectedSource) {
      return;
    }
    setSourceGroup(selectedSource.id, groupId);
    await persistStudioState();
  };

  const handleToggleSourceLock = async (sourceId: string) => {
    toggleSourceLocked(sourceId);
    await persistStudioState();
  };

  const handleMediaPauseToggle = async (sourceId: string, paused: boolean) => {
    setSourceMediaPaused(sourceId, paused);
    await persistStudioState();
  };

  const handleMediaRestart = async (sourceId: string) => {
    restartSourceMedia(sourceId);
    await persistStudioState();
  };

  const handleToggleLoop = async (sourceId: string, nextLoop: boolean) => {
    const source = sources[sourceId];
    if (!source || (source.type !== "video" && source.type !== "audio")) {
      return;
    }
    updateSource(sourceId, { data: { ...source.data, loop: nextLoop } });
    await persistStudioState();
  };

  const handleCreateGroup = async () => {
    const id = addGroup(newGroupName);
    setNewGroupName("");
    if (selectedSource) {
      setSourceGroup(selectedSource.id, id);
    }
    await persistStudioState();
  };

  const handleUpdateGroupName = async (groupId: string, name: string) => {
    renameGroup(groupId, name);
    await persistStudioState();
  };

  const handleRemoveGroup = async (groupId: string) => {
    removeGroup(groupId);
    await persistStudioState();
  };

  const displaysForType = displays.filter((display) => display.sourceType === (sourceType === "display" ? "screen" : "window"));

  return (
    <div className="scene-sources-panel">
      <div className="scene-row">
        <div className="scene-tabs">
          {scenes.map((scene) => (
            <button
              key={scene.id}
              className={`tab-btn ${scene.id === activeScene?.id ? "active" : ""}`}
              onClick={() => handleSelectScene(scene.id)}
            >
              {scene.name}
            </button>
          ))}
        </div>
        <div className="scene-actions">
          <button className="btn btn-outline btn-compact" onClick={handleAddScene}>
            Add Scene
          </button>
          <button
            className="btn btn-outline btn-compact"
            onClick={handleRemoveScene}
            disabled={scenes.length <= 1 || activeSceneLocked}
          >
            Delete Scene
          </button>
          <button className="btn btn-outline btn-compact" onClick={handleToggleSceneLock} disabled={!activeScene}>
            {activeSceneLocked ? "Unlock Scene" : "Lock Scene"}
          </button>
        </div>
      </div>

      {activeScene ? (
        <div className="scene-meta">
          <label htmlFor="sceneName">Scene Name</label>
          <input
            id="sceneName"
            value={activeScene.name}
            onChange={(event) => handleRenameScene(event.target.value)}
            disabled={activeSceneLocked}
          />
        </div>
      ) : null}

      <div className="sources-list">
        {sceneSources.length === 0 ? <div className="empty-hint">No sources yet.</div> : null}
        {sceneSources.map((source, index) => (
          <div
            key={source.id}
            className={`source-row ${selectedSourceId === source.id ? "selected" : ""}`}
            onClick={() => setSelectedSourceId(source.id)}
          >
            <div className="source-labels">
              <strong>{source.name}</strong>
              <span>{source.type}</span>
              {source.groupId && groupMap.get(source.groupId) ? (
                <span className="source-meta">Group: {groupMap.get(source.groupId)?.name}</span>
              ) : null}
              {source.locked ? <span className="source-meta">Locked</span> : null}
            </div>
            <div className="source-actions">
              <button
                className="btn btn-outline btn-compact"
                onClick={() => handleMove(source.id, -1)}
                disabled={index === 0 || activeSceneLocked || source.locked}
              >
                Up
              </button>
              <button
                className="btn btn-outline btn-compact"
                onClick={() => handleMove(source.id, 1)}
                disabled={index === sceneSources.length - 1 || activeSceneLocked || source.locked}
              >
                Down
              </button>
              <button className="btn btn-outline btn-compact" onClick={() => handleToggleEnabled(source.id)} disabled={activeSceneLocked}>
                {source.enabled ? "Hide" : "Show"}
              </button>
              {hasAudioToggle(source.type) ? (
                <button className="btn btn-outline btn-compact" onClick={() => handleToggleAudio(source.id)} disabled={activeSceneLocked}>
                  {source.audioEnabled ? "Mute" : "Audio"}
                </button>
              ) : null}
              <button
                className="btn btn-outline btn-compact"
                onClick={() => handleToggleSourceLock(source.id)}
                disabled={activeSceneLocked}
              >
                {source.locked ? "Unlock" : "Lock"}
              </button>
              <button
                className="btn btn-danger btn-compact"
                onClick={() => handleRemoveSource(source.id)}
                disabled={activeSceneLocked || source.locked}
              >
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>

      {selectedSource ? (
        <div className="selected-source-panel">
          <div className="panel-header">
            <h3>Selected Source</h3>
            <span className="tag">{selectedSource.type}</span>
          </div>
          <div className="field">
            <label htmlFor="selectedName">Name</label>
            <input
              id="selectedName"
              value={selectedSource.name}
              onChange={(event) => handleSourceNameChange(event.target.value)}
              disabled={activeSceneLocked}
            />
          </div>
          {(selectedSource.type === "image" ||
            selectedSource.type === "video" ||
            selectedSource.type === "audio" ||
            selectedSource.type === "browser") ? (
            <div className="field">
              <label htmlFor="selectedUrl">URL</label>
              <input
                id="selectedUrl"
                value={selectedSource.data.url}
                onChange={(event) => handleSourceUrlChange(event.target.value)}
                disabled={activeSceneLocked || selectedSource.locked}
              />
            </div>
          ) : null}
          {selectedSource.type === "text" ? (
            <div className="text-source-editor">
              <div className="field">
                <label htmlFor="selectedText">Live Text</label>
                <textarea
                  id="selectedText"
                  value={selectedSource.data.text}
                  onChange={(event) => handleTextSourceChange({ text: event.target.value })}
                  disabled={activeSceneLocked || selectedSource.locked}
                />
              </div>
              <div className="field-grid">
                <div className="field">
                  <label htmlFor="selectedTextSize">Font Size</label>
                  <input
                    id="selectedTextSize"
                    type="number"
                    min={12}
                    max={180}
                    value={selectedSource.data.fontSize}
                    onChange={(event) =>
                      handleTextSourceChange({ fontSize: clamp(parseNumber(event.target.value, selectedSource.data.fontSize), 12, 180) })
                    }
                    disabled={activeSceneLocked || selectedSource.locked}
                  />
                </div>
                <div className="field">
                  <label htmlFor="selectedTextAlign">Align</label>
                  <select
                    id="selectedTextAlign"
                    value={selectedSource.data.align}
                    onChange={(event) =>
                      handleTextSourceChange({ align: event.target.value as "left" | "center" | "right" })
                    }
                    disabled={activeSceneLocked || selectedSource.locked}
                  >
                    <option value="left">Left</option>
                    <option value="center">Center</option>
                    <option value="right">Right</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="selectedTextColor">Text Color</label>
                  <input
                    id="selectedTextColor"
                    type="color"
                    value={selectedSource.data.color}
                    onChange={(event) => handleTextSourceChange({ color: event.target.value })}
                    disabled={activeSceneLocked || selectedSource.locked}
                  />
                </div>
                <div className="field">
                  <label htmlFor="selectedTextBg">Background</label>
                  <input
                    id="selectedTextBg"
                    value={selectedSource.data.backgroundColor}
                    onChange={(event) => handleTextSourceChange({ backgroundColor: event.target.value })}
                    disabled={activeSceneLocked || selectedSource.locked}
                  />
                </div>
                <div className="field">
                  <label htmlFor="selectedTextRole">Output Role</label>
                  <select
                    id="selectedTextRole"
                    value={selectedSource.data.role ?? "standard"}
                    onChange={(event) => handleTextRoleChange(event.target.value as "standard" | "lower-third")}
                    disabled={activeSceneLocked || selectedSource.locked}
                  >
                    <option value="standard">Standard</option>
                    <option value="lower-third">Lower Third</option>
                  </select>
                </div>
              </div>
            </div>
          ) : null}
          {hasAudioToggle(selectedSource.type) ? (
            <div className="field">
              <label htmlFor="selectedVolume">
                Source Volume ({Math.round((selectedSource.volume ?? 1) * 100)}%)
              </label>
              <input
                id="selectedVolume"
                type="range"
                min={0}
                max={2}
                step={0.01}
                value={selectedSource.volume ?? 1}
                onChange={(event) => handleVolumeChange(Number(event.target.value))}
                disabled={activeSceneLocked || selectedSource.locked}
              />
            </div>
          ) : null}
          <div className="field field-row">
            <label htmlFor="selectedLock">Locked</label>
            <input
              id="selectedLock"
              type="checkbox"
              checked={Boolean(selectedSource.locked)}
              onChange={() => handleToggleSourceLock(selectedSource.id)}
              disabled={activeSceneLocked}
            />
          </div>
          <div className="field">
            <label htmlFor="selectedGroup">Group</label>
            <select
              id="selectedGroup"
              value={selectedSource.groupId ?? ""}
              onChange={(event) => handleAssignGroup(event.target.value || null)}
              disabled={activeSceneLocked}
            >
              <option value="">No Group</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </div>
          <div className="field-grid">
            <div className="field">
              <label htmlFor="transformX">X (%)</label>
              <input
                id="transformX"
                type="number"
                value={Math.round(selectedSource.rect.x)}
                onChange={(event) => handleTransformChange({ x: parseNumber(event.target.value, selectedSource.rect.x) })}
                disabled={activeSceneLocked || selectedSource.locked}
              />
            </div>
            <div className="field">
              <label htmlFor="transformY">Y (%)</label>
              <input
                id="transformY"
                type="number"
                value={Math.round(selectedSource.rect.y)}
                onChange={(event) => handleTransformChange({ y: parseNumber(event.target.value, selectedSource.rect.y) })}
                disabled={activeSceneLocked || selectedSource.locked}
              />
            </div>
            <div className="field">
              <label htmlFor="transformW">W (%)</label>
              <input
                id="transformW"
                type="number"
                value={Math.round(selectedSource.rect.width)}
                onChange={(event) =>
                  handleTransformChange({ width: parseNumber(event.target.value, selectedSource.rect.width) })
                }
                disabled={activeSceneLocked || selectedSource.locked}
              />
            </div>
            <div className="field">
              <label htmlFor="transformH">H (%)</label>
              <input
                id="transformH"
                type="number"
                value={Math.round(selectedSource.rect.height)}
                onChange={(event) =>
                  handleTransformChange({ height: parseNumber(event.target.value, selectedSource.rect.height) })
                }
                disabled={activeSceneLocked || selectedSource.locked}
              />
            </div>
          </div>
          <div className="field">
            <label htmlFor="transformRotate">Rotation (deg)</label>
            <input
              id="transformRotate"
              type="number"
              value={Math.round(selectedSource.rotation ?? 0)}
              onChange={(event) => handleTransformChange({}, parseNumber(event.target.value, selectedSource.rotation ?? 0))}
              disabled={activeSceneLocked || selectedSource.locked}
            />
          </div>
          {(selectedSource.type === "video" || selectedSource.type === "audio") ? (
            <div className="media-controls">
              <button
                className="btn btn-outline btn-compact"
                onClick={() => handleMediaPauseToggle(selectedSource.id, !(selectedSource.media?.paused ?? false))}
                disabled={activeSceneLocked}
              >
                {selectedSource.media?.paused ? "Play" : "Pause"}
              </button>
              <button
                className="btn btn-outline btn-compact"
                onClick={() => handleMediaRestart(selectedSource.id)}
                disabled={activeSceneLocked}
              >
                Restart
              </button>
              <button
                className="btn btn-outline btn-compact"
                onClick={() =>
                  handleToggleLoop(selectedSource.id, !selectedSource.data.loop)
                }
                disabled={activeSceneLocked}
              >
                Loop: {selectedSource.data.loop ? "On" : "Off"}
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      <div className="groups-panel">
        <div className="panel-header">
          <h3>Groups</h3>
          <span className="tag">{groups.length}</span>
        </div>
        <div className="field">
          <label htmlFor="newGroup">New Group</label>
          <div className="field-row">
            <input
              id="newGroup"
              value={newGroupName}
              onChange={(event) => setNewGroupName(event.target.value)}
              placeholder="Group name"
              disabled={activeSceneLocked}
            />
            <button className="btn btn-outline btn-compact" onClick={handleCreateGroup} disabled={activeSceneLocked}>
              Add
            </button>
          </div>
        </div>
        {groups.length === 0 ? <div className="empty-hint">No groups yet.</div> : null}
        {groups.map((group) => (
          <div key={group.id} className="group-row">
            <input
              value={group.name}
              onChange={(event) => handleUpdateGroupName(group.id, event.target.value)}
              disabled={activeSceneLocked}
            />
            <button className="btn btn-danger btn-compact" onClick={() => handleRemoveGroup(group.id)} disabled={activeSceneLocked}>
              Remove
            </button>
          </div>
        ))}
      </div>

      <div className="add-source">
        <div className="field">
          <label htmlFor="sourceType">Source Type</label>
          <select id="sourceType" value={sourceType} onChange={(event) => setSourceType(event.target.value as SourceType)}>
            <option value="display">Display</option>
            <option value="window">Window</option>
            <option value="camera">Camera</option>
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="browser">Browser</option>
            <option value="audio">Audio</option>
            <option value="text">Text</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="sourceName">Name</label>
          <input
            id="sourceName"
            value={sourceName}
            onChange={(event) => setSourceName(event.target.value)}
            placeholder="Optional"
          />
        </div>
        {(sourceType === "display" || sourceType === "window") ? (
          <div className="field">
            <label htmlFor="captureId">Select {sourceType === "display" ? "Display" : "Window"}</label>
            <select id="captureId" value={captureId} onChange={(event) => setCaptureId(event.target.value)}>
              <option value="">Choose...</option>
              {displaysForType.map((display) => (
                <option key={display.id} value={display.id}>
                  {display.name}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {sourceType === "camera" ? (
          <div className="field">
            <label htmlFor="cameraId">Camera</label>
            <select id="cameraId" value={cameraId} onChange={(event) => setCameraId(event.target.value)}>
              <option value="">Choose...</option>
              {cameras.map((camera) => (
                <option key={camera.deviceId} value={camera.deviceId}>
                  {camera.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}
        {sourceType === "image" || sourceType === "video" || sourceType === "audio" || sourceType === "browser" ? (
          <div className="field">
            <label htmlFor="sourceUrl">URL</label>
            <input
              id="sourceUrl"
              value={sourceUrl}
              onChange={(event) => setSourceUrl(event.target.value)}
              placeholder={sourceType === "browser" ? "https://example.com" : "File or URL"}
            />
            {sourceType !== "browser" ? (
              <button className="btn btn-outline btn-compact" onClick={handlePickFile}>
                Pick File
              </button>
            ) : null}
          </div>
        ) : null}
        {sourceType === "text" ? (
          <div className="field">
            <label htmlFor="sourceText">Text</label>
            <textarea
              id="sourceText"
              value={sourceText}
              onChange={(event) => setSourceText(event.target.value)}
              placeholder="Text to show on Program"
            />
          </div>
        ) : null}
        <button className="btn btn-primary" onClick={handleAddSource} disabled={!activeScene || activeSceneLocked}>
          Add Source
        </button>
      </div>
    </div>
  );
};

export default SceneSourcesPanel;

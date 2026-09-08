import React, { useEffect, useMemo, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { Source, SourceCrop, SourceRect, SourceType } from "../../shared/types";
import ContextMenu from "./ContextMenu";
import RowAction from "./RowAction";

type CameraDevice = {
  deviceId: string;
  label: string;
};

type SourceMenu = {
  x: number;
  y: number;
  sourceId?: string;
};

type ToolOverlay = "properties" | "groups" | "add" | null;

const hasAudioToggle = (type: SourceType) => ["display", "window", "video", "audio"].includes(type);
const isVisualSource = (source: Source) => source.type !== "audio" && source.type !== "text";

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
    refreshDisplays,
    settings,
    groups,
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
    setProgramScene,
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
  const [captureFilter, setCaptureFilter] = useState("");
  const [sourceMenu, setSourceMenu] = useState<SourceMenu | null>(null);
  const [toolOverlay, setToolOverlay] = useState<ToolOverlay>(null);

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

  useEffect(() => {
    if (toolOverlay === "add" && (sourceType === "display" || sourceType === "window")) {
      refreshDisplays().catch(() => undefined);
    }
  }, [refreshDisplays, sourceType, toolOverlay]);

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
        captureCursor: "never",
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

  const handleAudioScopeChange = async (audioScope: "scene" | "persistent") => {
    if (!selectedSource || !hasAudioToggle(selectedSource.type)) {
      return;
    }
    updateSource(selectedSource.id, { audioScope });
    await persistStudioState();
  };

  const handleCropChange = async (edge: keyof SourceCrop, value: number) => {
    if (!selectedSource || selectedSource.type === "audio" || selectedSource.type === "text") {
      return;
    }
    const current = selectedSource.crop ?? { top: 0, right: 0, bottom: 0, left: 0 };
    const opposite: Record<keyof SourceCrop, keyof SourceCrop> = {
      top: "bottom",
      bottom: "top",
      left: "right",
      right: "left"
    };
    const max = 95 - current[opposite[edge]];
    updateSource(selectedSource.id, { crop: { ...current, [edge]: clamp(value, 0, max) } });
    await persistStudioState();
  };

  const handleApplyTextLayout = async (
    preset: "full" | "half-video-left" | "half-video-right" | "quarter-video-left" | "quarter-video-right"
  ) => {
    if (!selectedSource || selectedSource.type !== "text" || !activeScene) {
      return;
    }
    const candidates = sceneSources.filter((source) =>
      isVisualSource(source) && (!selectedSource.groupId || source.groupId === selectedSource.groupId)
    );
    const videoSource = candidates[candidates.length - 1];

    if (preset === "full") {
      updateSourceRect(selectedSource.id, { x: 0, y: 0, width: 100, height: 100 });
    } else {
      const videoOnLeft = preset.endsWith("left");
      const videoWidth = preset.startsWith("half") ? 50 : 25;
      const textWidth = 100 - videoWidth;
      updateSourceRect(selectedSource.id, {
        x: videoOnLeft ? videoWidth : 0,
        y: 0,
        width: textWidth,
        height: 100
      });
      if (videoSource) {
        updateSourceRect(videoSource.id, {
          x: videoOnLeft ? 0 : textWidth,
          y: 0,
          width: videoWidth,
          height: 100
        });
      }
    }
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

  const displaysForType = displays.filter((display) => {
    const matchesType = display.sourceType === (sourceType === "display" ? "screen" : "window");
    const matchesFilter = !captureFilter.trim() || display.name.toLowerCase().includes(captureFilter.trim().toLowerCase());
    return matchesType && matchesFilter;
  });
  const menuSource = sourceMenu?.sourceId ? sources[sourceMenu.sourceId] ?? null : null;
  const menuSourceIndex = menuSource ? sceneSources.findIndex((source) => source.id === menuSource.id) : -1;

  const runMenuAction = (action: () => void | Promise<void>) => {
    setSourceMenu(null);
    void action();
  };

  return (
    <div
      className="scene-sources-panel sources-panel"
      onContextMenu={(event) => {
        if ((event.target as HTMLElement).closest(".panel-tool-overlay")) {
          return;
        }
        event.preventDefault();
        setSourceMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      <div className="sources-list">
        <div className="row-actions">
          <RowAction icon="+" label="Add Source" disabled={!activeScene || activeSceneLocked} onClick={() => setToolOverlay("add")} />
          <RowAction icon="▤" label="Manage Groups" onClick={() => setToolOverlay("groups")} />
        </div>
        {sceneSources.length === 0 ? <div className="empty-hint">No sources in {activeScene?.name ?? "this scene"}.</div> : null}
        {sceneSources.map((source, index) => (
          <div
            key={source.id}
            className={`source-row ${selectedSourceId === source.id ? "selected" : ""}`}
            onClick={() => setSelectedSourceId(source.id)}
            onDoubleClick={() => {
              if (source.type === "text" && activeScene) {
                setProgramScene(activeScene.id);
                void persistStudioState();
              }
            }}
            title={source.type === "text" ? "Double-click to send this scene and text to Program" : undefined}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setSelectedSourceId(source.id);
              setSourceMenu({ x: event.clientX, y: event.clientY, sourceId: source.id });
            }}
          >
            <div className="source-labels">
              <strong>{source.name}</strong>
              <span>{source.type}</span>
              {source.groupId && groupMap.get(source.groupId) ? (
                <span className="source-meta">Group: {groupMap.get(source.groupId)?.name}</span>
              ) : null}
              {source.locked ? <span className="source-meta">Locked</span> : null}
            </div>
            <div className="row-actions">
              <RowAction icon={source.enabled ? "◉" : "⊘"} label={source.enabled ? "Hide Source" : "Show Source"} disabled={activeSceneLocked} onClick={() => void handleToggleEnabled(source.id)} />
              {hasAudioToggle(source.type) ? <RowAction icon={source.audioEnabled ? "♪" : "♩"} label={source.audioEnabled ? "Mute Source" : "Enable Audio"} disabled={activeSceneLocked} onClick={() => void handleToggleAudio(source.id)} /> : null}
              <RowAction icon={source.locked ? "🔒" : "🔓"} label={source.locked ? "Unlock Source" : "Lock Source"} disabled={activeSceneLocked} onClick={() => void handleToggleSourceLock(source.id)} />
              <RowAction icon="↑" label="Move Source Up" disabled={index === 0 || activeSceneLocked || source.locked} onClick={() => void handleMove(source.id, -1)} />
              <RowAction icon="↓" label="Move Source Down" disabled={index === sceneSources.length - 1 || activeSceneLocked || source.locked} onClick={() => void handleMove(source.id, 1)} />
              <RowAction icon="✎" label="Source Properties" onClick={() => { setSelectedSourceId(source.id); setToolOverlay("properties"); }} />
              <RowAction icon="×" label="Remove Source" disabled={activeSceneLocked || source.locked} onClick={() => void handleRemoveSource(source.id)} />
            </div>
          </div>
        ))}
      </div>
      <div className="panel-context-hint">Right-click a source or empty space for options.</div>

      {toolOverlay === "properties" && selectedSource ? (
        <div className="selected-source-panel panel-tool-overlay">
          <div className="panel-header">
            <h3>Selected Source</h3>
            <div className="panel-overlay-actions">
              <span className="tag">{selectedSource.type}</span>
              <button className="btn btn-outline btn-compact" onClick={() => setToolOverlay(null)}>Close</button>
            </div>
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
              <div className="field">
                <label>Quick Text + Video Layout</label>
                <div className="layout-preset-grid">
                  <button className="btn btn-outline btn-compact" onClick={() => handleApplyTextLayout("full")} disabled={activeSceneLocked || selectedSource.locked}>Full Text</button>
                  <button className="btn btn-outline btn-compact" onClick={() => handleApplyTextLayout("half-video-left")} disabled={activeSceneLocked || selectedSource.locked}>1/2 - Video Left</button>
                  <button className="btn btn-outline btn-compact" onClick={() => handleApplyTextLayout("half-video-right")} disabled={activeSceneLocked || selectedSource.locked}>1/2 - Video Right</button>
                  <button className="btn btn-outline btn-compact" onClick={() => handleApplyTextLayout("quarter-video-left")} disabled={activeSceneLocked || selectedSource.locked}>Text 3/4 - Video Left</button>
                  <button className="btn btn-outline btn-compact" onClick={() => handleApplyTextLayout("quarter-video-right")} disabled={activeSceneLocked || selectedSource.locked}>Text 3/4 - Video Right</button>
                </div>
                <span className="field-help">Uses a visual source in the same group when grouped; otherwise it uses the top visual source in this scene.</span>
              </div>
            </div>
          ) : null}
          {(selectedSource.type === "display" || selectedSource.type === "window") ? (
            <div className="field">
              <label htmlFor="selectedCaptureCursor">Cursor in Program</label>
              <select
                id="selectedCaptureCursor"
                value={selectedSource.captureCursor ?? "never"}
                onChange={(event) => {
                  updateSource(selectedSource.id, { captureCursor: event.target.value as "never" | "motion" | "always" });
                  persistStudioState().catch(() => undefined);
                }}
                disabled={activeSceneLocked || selectedSource.locked}
              >
                <option value="never">Hide Cursor</option>
                <option value="motion">Show While Moving</option>
                <option value="always">Always Show</option>
              </select>
              <span className="field-help">Hide Cursor prevents the pointer from appearing in Program, recordings, streams, and sanctuary output.</span>
            </div>
          ) : null}
          {hasAudioToggle(selectedSource.type) ? (
            <>
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
              <div className="field">
                <label htmlFor="selectedAudioScope">Audio Routing</label>
                <select
                  id="selectedAudioScope"
                  value={selectedSource.audioScope ?? "scene"}
                  onChange={(event) => handleAudioScopeChange(event.target.value as "scene" | "persistent")}
                  disabled={activeSceneLocked || selectedSource.locked}
                >
                  <option value="scene">Only while this scene is live</option>
                  <option value="persistent">Keep playing across all scenes</option>
                </select>
              </div>
            </>
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
          {selectedSource.type !== "audio" && selectedSource.type !== "text" ? (
            <div className="field">
              <label>Trim / Crop Edges (%)</label>
              <div className="trim-grid">
                {(["top", "right", "bottom", "left"] as const).map((edge) => (
                  <label key={edge}>
                    <span>{edge.charAt(0).toUpperCase() + edge.slice(1)}</span>
                    <input
                      type="number"
                      min={0}
                      max={95}
                      step={0.5}
                      value={selectedSource.crop?.[edge] ?? 0}
                      onChange={(event) => handleCropChange(edge, parseNumber(event.target.value, selectedSource.crop?.[edge] ?? 0))}
                      disabled={activeSceneLocked || selectedSource.locked}
                    />
                  </label>
                ))}
              </div>
              <span className="field-help">Trim in Preview, then press TAKE. Program stays unchanged until TAKE.</span>
            </div>
          ) : null}
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

      {toolOverlay === "groups" ? (
      <div className="groups-panel panel-tool-overlay">
        <div className="panel-header">
          <h3>Groups</h3>
          <div className="panel-overlay-actions">
            <span className="tag">{groups.length}</span>
            <button className="btn btn-outline btn-compact" onClick={() => setToolOverlay(null)}>Close</button>
          </div>
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
      ) : null}

      {toolOverlay === "add" ? (
      <div className="add-source panel-tool-overlay">
        <div className="panel-header">
          <h3>Add Source</h3>
          <button className="btn btn-outline btn-compact" onClick={() => setToolOverlay(null)}>Close</button>
        </div>
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
            <div className="panel-header">
              <label htmlFor="captureFilter">Select {sourceType === "display" ? "Display" : "Open Window"}</label>
              <button className="btn btn-outline btn-compact" onClick={() => refreshDisplays()}>Refresh</button>
            </div>
            <input
              id="captureFilter"
              value={captureFilter}
              onChange={(event) => setCaptureFilter(event.target.value)}
              placeholder="Search open windows"
            />
            <div className="capture-options-grid">
              {displaysForType.map((display) => (
                <label key={display.id} className={`capture-option ${captureId === display.id ? "selected" : ""}`}>
                  <input
                    type="radio"
                    name="captureSource"
                    value={display.id}
                    checked={captureId === display.id}
                    onChange={() => setCaptureId(display.id)}
                  />
                  {display.thumbnailUrl ? <img src={display.thumbnailUrl} alt="" /> : <div className="capture-placeholder" />}
                  <span>{display.name}</span>
                </label>
              ))}
            </div>
            {displaysForType.length === 0 ? (
              <div className="empty-hint">No matching windows. Open the app or browser video, then press Refresh.</div>
            ) : null}
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
            {sourceType === "browser" ? <div className="field-help">Paste a YouTube, website, dashboard, or hosted media URL.</div> : null}
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
      ) : null}

      {sourceMenu ? (
        <ContextMenu x={sourceMenu.x} y={sourceMenu.y} onClose={() => setSourceMenu(null)} ariaLabel="Source options">
          <div className="context-menu-title">{menuSource?.name ?? activeScene?.name ?? "Sources"}</div>
          {menuSource ? (
            <>
              <button
                onClick={() => runMenuAction(() => handleMove(menuSource.id, -1))}
                disabled={menuSourceIndex <= 0 || activeSceneLocked || menuSource.locked}
              >
                Move Up
              </button>
              <button
                onClick={() => runMenuAction(() => handleMove(menuSource.id, 1))}
                disabled={menuSourceIndex < 0 || menuSourceIndex === sceneSources.length - 1 || activeSceneLocked || menuSource.locked}
              >
                Move Down
              </button>
              <button onClick={() => runMenuAction(() => handleToggleEnabled(menuSource.id))} disabled={activeSceneLocked}>
                {menuSource.enabled ? "Hide Source" : "Show Source"}
              </button>
              {hasAudioToggle(menuSource.type) ? (
                <button onClick={() => runMenuAction(() => handleToggleAudio(menuSource.id))} disabled={activeSceneLocked}>
                  {menuSource.audioEnabled ? "Mute Source" : "Enable Audio"}
                </button>
              ) : null}
              <button onClick={() => runMenuAction(() => handleToggleSourceLock(menuSource.id))} disabled={activeSceneLocked}>
                {menuSource.locked ? "Unlock Source" : "Lock Source"}
              </button>
              <button onClick={() => runMenuAction(() => setToolOverlay("properties"))}>Properties</button>
              <button
                className="context-menu-danger"
                onClick={() => runMenuAction(() => handleRemoveSource(menuSource.id))}
                disabled={activeSceneLocked || menuSource.locked}
              >
                Remove Source
              </button>
              <div className="context-menu-separator" />
            </>
          ) : null}
          <button onClick={() => runMenuAction(() => setToolOverlay("add"))} disabled={!activeScene || activeSceneLocked}>
            Add Source
          </button>
          <button onClick={() => runMenuAction(() => setToolOverlay("groups"))}>Manage Groups</button>
        </ContextMenu>
      ) : null}
    </div>
  );
};

export default SceneSourcesPanel;

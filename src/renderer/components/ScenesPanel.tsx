import React, { useState } from "react";
import { useAppStore } from "../store/useAppStore";
import ContextMenu from "./ContextMenu";
import RowAction from "./RowAction";
import AddToScheduleButton from "./AddToScheduleButton";
import { sceneScheduleDraft } from "../utils/serviceScheduleActions";
import type { Scene } from "../../shared/types";

type ScenesPanelProps = {
  directToProgram?: boolean;
};

type SceneMenu = {
  x: number;
  y: number;
  sceneId?: string;
};

const ScenesPanel: React.FC<ScenesPanelProps> = ({ directToProgram = false }) => {
  const {
    scenes,
    previewSceneId,
    programSceneId,
    presentedProgram,
    addScene,
    renameScene,
    removeScene,
    toggleSceneLocked,
    toggleSceneEnabled,
    selectPreviewScene,
    setProgramScene,
    persistStudioState
  } = useAppStore();
  const [menu, setMenu] = useState<SceneMenu | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const selectedScene = menu?.sceneId ? scenes.find((scene) => scene.id === menu.sceneId) ?? null : null;

  const persist = () => persistStudioState().catch(() => undefined);

  const handleSelect = (sceneId: string) => {
    if (directToProgram) {
      setProgramScene(sceneId);
    } else {
      selectPreviewScene(sceneId);
      persist();
    }
  };

  const selectedSceneId = directToProgram ? programSceneId : previewSceneId;
  const liveSceneId = presentedProgram ? presentedProgram.scene?.id : programSceneId;
  const canDelete = (scene: Scene) => !scene.locked && scene.id !== programSceneId && scene.id !== liveSceneId && scenes.length > 1;

  const handleAdd = () => {
    addScene();
    setMenu(null);
    persist();
  };

  const handleRename = () => {
    if (!selectedScene || selectedScene.locked || !renameValue.trim()) {
      return;
    }
    renameScene(selectedScene.id, renameValue.trim());
    setMenu(null);
    persist();
  };

  const handleToggleLock = () => {
    if (!selectedScene) {
      return;
    }
    toggleSceneLocked(selectedScene.id);
    setMenu(null);
    persist();
  };

  const handleDelete = () => {
    if (!selectedScene || !canDelete(selectedScene)) {
      return;
    }
    removeScene(selectedScene.id);
    setMenu(null);
    persist();
  };

  return (
    <div
      className="scenes-panel"
      onContextMenu={(event) => {
        event.preventDefault();
        setMenu({ x: event.clientX, y: event.clientY });
      }}
    >
      <RowAction icon="+" label="Add Scene" onClick={handleAdd} />
      <AddToScheduleButton label="selected scene" disabled={!selectedSceneId} getItem={() => {
        const state = useAppStore.getState(), scene = state.scenes.find(item => item.id === selectedSceneId);
        if (!scene) throw Error("Choose a scene first.");
        return sceneScheduleDraft(scene, state.sources);
      }} />
      <div className="scene-list" aria-label="Scenes">
        {scenes.map((scene) => (
          <div
            key={scene.id}
            className={`scene-list-item ${scene.id === selectedSceneId ? "active" : ""} ${directToProgram && scene.id === liveSceneId ? "program-live" : ""}`}
            onClick={() => handleSelect(scene.id)}
            onContextMenu={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!directToProgram) selectPreviewScene(scene.id);
              setRenameValue(scene.name);
              setMenu({ x: event.clientX, y: event.clientY, sceneId: scene.id });
            }}
          >
            <button type="button" className="scene-select" aria-pressed={scene.id === selectedSceneId} onClick={(event) => { event.stopPropagation(); handleSelect(scene.id); }}>{scene.name}</button>
            {directToProgram && scene.id === liveSceneId ? <span className="scene-live-label">LIVE</span> : null}
            {scene.locked ? <span className="scene-lock" aria-label="Locked">◆</span> : null}
            <div className="row-actions">
              <RowAction icon={scene.enabled !== false ? "◉" : "⊘"} label={scene.enabled !== false ? "Hide Scene" : "Show Scene"} disabled={scene.locked} onClick={() => { toggleSceneEnabled(scene.id); persist(); }} />
              <RowAction icon={scene.locked ? "🔒" : "🔓"} label={scene.locked ? "Unlock Scene" : "Lock Scene"} onClick={() => { toggleSceneLocked(scene.id); persist(); }} />
              <RowAction icon="✎" label="Rename Scene" disabled={scene.locked} onClick={(event) => { const rect = event.currentTarget.getBoundingClientRect(); setRenameValue(scene.name); setMenu({ x: rect.left, y: rect.bottom, sceneId: scene.id }); }} />
              <RowAction icon="×" label="Delete Scene" disabled={!canDelete(scene)} onClick={() => { removeScene(scene.id); persist(); }} />
            </div>
          </div>
        ))}
      </div>
      <div className="panel-context-hint">{directToProgram ? "Program Focus: one click sends a scene directly live. Right-click for options." : "Right-click a scene or empty space for options."}</div>
      {menu ? (
        <ContextMenu x={menu.x} y={menu.y} onClose={() => setMenu(null)} ariaLabel="Scene options">
          <div className="context-menu-title">{selectedScene?.name ?? "Scenes"}</div>
          {selectedScene ? (
            <>
              <div className="context-menu-field">
                <input
                  aria-label="Scene name"
                  value={renameValue}
                  onChange={(event) => setRenameValue(event.target.value)}
                  disabled={selectedScene.locked}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      handleRename();
                    }
                  }}
                />
                <button onClick={handleRename} disabled={selectedScene.locked || !renameValue.trim()}>Rename</button>
              </div>
              <button onClick={handleToggleLock}>{selectedScene.locked ? "Unlock Scene" : "Lock Scene"}</button>
              <button className="context-menu-danger" onClick={handleDelete} disabled={!canDelete(selectedScene)}>
                Delete Scene
              </button>
              {selectedScene.id === liveSceneId ? <div className="context-menu-note">TAKE another scene before deleting the live Program scene.</div> : null}
              <div className="context-menu-separator" />
            </>
          ) : null}
          <button onClick={handleAdd}>Add Scene</button>
        </ContextMenu>
      ) : null}
    </div>
  );
};

export default ScenesPanel;

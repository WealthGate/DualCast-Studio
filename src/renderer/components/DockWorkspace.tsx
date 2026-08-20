import React, { ReactNode, useEffect, useMemo, useRef, useState } from "react";
import ContextMenu from "./ContextMenu";

export type DockPanelDefinition = {
  id: string;
  title: string;
  content: ReactNode;
};

export type DockZoneId = "top" | "left" | "right" | "bottom";

export type DockGroup = {
  id: string;
  panelIds: string[];
  activePanelId: string;
};

export type DockLayout = Record<DockZoneId, DockGroup[]>;

type DockSizes = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  groups: Record<string, number>;
};

type DockContextMenu = {
  x: number;
  y: number;
  panelId?: string;
};

const STORAGE_KEY = "openchurch:dock-layout:v2";
const SIZE_STORAGE_KEY = "openchurch:dock-sizes:v1";
const SCHEMA_STORAGE_KEY = "openchurch:dock-layout-schema";
const CURRENT_LAYOUT_SCHEMA = 3;

const defaultLayout: DockLayout = {
  top: [],
  left: [
    { id: "dock-scenes", panelIds: ["scenes"], activePanelId: "scenes" },
    { id: "dock-sources", panelIds: ["sources"], activePanelId: "sources" }
  ],
  right: [
    {
      id: "dock-live",
      panelIds: ["streaming", "venue", "displays", "lower-third", "scripture"],
      activePanelId: "streaming"
    },
    {
      id: "dock-tools",
      panelIds: ["system", "editor"],
      activePanelId: "system"
    }
  ],
  bottom: [
    { id: "dock-audio", panelIds: ["audio"], activePanelId: "audio" },
    { id: "dock-transitions", panelIds: ["transitions"], activePanelId: "transitions" },
    { id: "dock-controls", panelIds: ["controls"], activePanelId: "controls" }
  ]
};

const defaultSizes: DockSizes = {
  left: 300,
  right: 320,
  top: 200,
  bottom: 235,
  groups: {}
};

const zoneIds: DockZoneId[] = ["top", "left", "right", "bottom"];

const cloneLayout = (layout: DockLayout): DockLayout => ({
  top: layout.top.map((group) => ({ ...group, panelIds: [...group.panelIds] })),
  left: layout.left.map((group) => ({ ...group, panelIds: [...group.panelIds] })),
  right: layout.right.map((group) => ({ ...group, panelIds: [...group.panelIds] })),
  bottom: layout.bottom.map((group) => ({ ...group, panelIds: [...group.panelIds] }))
});

export const normalizeLayout = (layout: DockLayout, panelIds: Set<string>): DockLayout => {
  const seen = new Set<string>();
  const normalized = cloneLayout(layout);

  zoneIds.forEach((zoneId) => {
    normalized[zoneId] = normalized[zoneId]
      .map((group) => {
        const nextPanelIds = group.panelIds.filter((panelId) => {
          if (!panelIds.has(panelId) || seen.has(panelId)) {
            return false;
          }
          seen.add(panelId);
          return true;
        });
        return {
          ...group,
          panelIds: nextPanelIds,
          activePanelId: nextPanelIds.includes(group.activePanelId)
            ? group.activePanelId
            : nextPanelIds[0] ?? ""
        };
      })
      .filter((group) => group.panelIds.length > 0);
  });

  return normalized;
};

export const migrateDockLayout = (layout: DockLayout, panelIds: Set<string>, schemaVersion: number) => {
  const normalized = normalizeLayout(layout, panelIds);
  if (schemaVersion >= CURRENT_LAYOUT_SCHEMA) {
    return normalized;
  }

  const visibleIds = new Set(zoneIds.flatMap((zoneId) => normalized[zoneId].flatMap((group) => group.panelIds)));
  const newPanelIds = ["lower-third", "scripture"].filter(
    (panelId) => panelIds.has(panelId) && !visibleIds.has(panelId)
  );
  if (newPanelIds.length === 0) {
    return normalized;
  }

  const liveGroup = normalized.right.find((group) => group.id === "dock-live") ?? normalized.right[0];
  if (liveGroup) {
    liveGroup.panelIds.push(...newPanelIds);
  } else {
    normalized.right.push({
      id: "dock-live",
      panelIds: newPanelIds,
      activePanelId: newPanelIds[0]
    });
  }
  return normalized;
};

const loadLayout = (panelIds: Set<string>) => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    const schemaVersion = Number(window.localStorage.getItem(SCHEMA_STORAGE_KEY)) || 2;
    if (stored) {
      const migrated = migrateDockLayout(JSON.parse(stored) as DockLayout, panelIds, schemaVersion);
      window.localStorage.setItem(SCHEMA_STORAGE_KEY, String(CURRENT_LAYOUT_SCHEMA));
      return migrated;
    }
  } catch {
    window.localStorage.setItem(SCHEMA_STORAGE_KEY, String(CURRENT_LAYOUT_SCHEMA));
    return normalizeLayout(defaultLayout, panelIds);
  }
  window.localStorage.setItem(SCHEMA_STORAGE_KEY, String(CURRENT_LAYOUT_SCHEMA));
  return normalizeLayout(defaultLayout, panelIds);
};

const loadSizes = () => {
  try {
    const stored = window.localStorage.getItem(SIZE_STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored) as Partial<DockSizes>;
      const safeSize = (value: unknown, fallback: number) => {
        const number = Number(value);
        return Number.isFinite(number) ? Math.max(100, Math.min(2_000, number)) : fallback;
      };
      const groups = Object.fromEntries(
        Object.entries(parsed.groups ?? {}).map(([id, value]) => [id, safeSize(value, 200)])
      );
      return {
        left: safeSize(parsed.left, defaultSizes.left),
        right: safeSize(parsed.right, defaultSizes.right),
        top: safeSize(parsed.top, defaultSizes.top),
        bottom: safeSize(parsed.bottom, defaultSizes.bottom),
        groups
      };
    }
  } catch {
    return defaultSizes;
  }
  return defaultSizes;
};

const removePanelFromLayout = (source: DockLayout, panelId: string) => {
  zoneIds.forEach((zoneId) => {
    source[zoneId] = source[zoneId]
      .map((group) => {
        const nextPanelIds = group.panelIds.filter((id) => id !== panelId);
        return {
          ...group,
          panelIds: nextPanelIds,
          activePanelId: group.activePanelId === panelId ? nextPanelIds[0] ?? "" : group.activePanelId
        };
      })
      .filter((group) => group.panelIds.length > 0);
  });
};

export const moveDockPanel = (
  current: DockLayout,
  panelId: string,
  zoneId: DockZoneId,
  groupId?: string
) => {
  const next = cloneLayout(current);
  removePanelFromLayout(next, panelId);
  const targetGroup = groupId ? next[zoneId].find((group) => group.id === groupId) : undefined;
  if (targetGroup) {
    targetGroup.panelIds.push(panelId);
    targetGroup.activePanelId = panelId;
  } else {
    next[zoneId].push({
      id: `dock-${zoneId}-${Date.now()}-${panelId}`,
      panelIds: [panelId],
      activePanelId: panelId
    });
  }
  return next;
};

export const closeDockPanel = (current: DockLayout, panelId: string) => {
  const next = cloneLayout(current);
  removePanelFromLayout(next, panelId);
  return next;
};

type DockWorkspaceProps = {
  panels: DockPanelDefinition[];
  center: ReactNode;
};

const DockWorkspace: React.FC<DockWorkspaceProps> = ({ panels, center }) => {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const contentRefs = useRef(new Map<string, HTMLDivElement>());
  const panelMap = useMemo(() => new Map(panels.map((panel) => [panel.id, panel])), [panels]);
  const panelIds = useMemo(() => new Set(panelMap.keys()), [panelMap]);
  const [layout, setLayout] = useState<DockLayout>(() => loadLayout(panelIds));
  const [sizes, setSizes] = useState<DockSizes>(loadSizes);
  const [draggingPanelId, setDraggingPanelId] = useState<string | null>(null);
  const [contextMenu, setContextMenu] = useState<DockContextMenu | null>(null);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  }, [layout]);

  useEffect(() => {
    window.localStorage.setItem(SIZE_STORAGE_KEY, JSON.stringify(sizes));
  }, [sizes]);

  const visiblePanelIds = useMemo(
    () => new Set(zoneIds.flatMap((zoneId) => layout[zoneId].flatMap((group) => group.panelIds))),
    [layout]
  );
  const hiddenPanels = panels.filter((panel) => !visiblePanelIds.has(panel.id));

  const movePanel = (panelId: string, zoneId: DockZoneId, groupId?: string) => {
    if (!panelMap.has(panelId)) {
      return;
    }
    setLayout((current) => moveDockPanel(current, panelId, zoneId, groupId));
    setDraggingPanelId(null);
    setContextMenu(null);
  };

  const closePanel = (panelId: string) => {
    setLayout((current) => closeDockPanel(current, panelId));
    setContextMenu(null);
  };

  const setActivePanel = (zoneId: DockZoneId, groupId: string, panelId: string) => {
    setLayout((current) => {
      const next = cloneLayout(current);
      const group = next[zoneId].find((entry) => entry.id === groupId);
      if (group?.panelIds.includes(panelId)) {
        group.activePanelId = panelId;
      }
      return next;
    });
    window.requestAnimationFrame(() => {
      const content = contentRefs.current.get(groupId);
      if (content) {
        content.scrollTop = 0;
        content.scrollLeft = 0;
        const activePanel = Array.from(content.querySelectorAll<HTMLElement>(".dock-panel-instance"))
          .find((element) => element.dataset.dockPanelId === panelId);
        if (activePanel) {
          [activePanel, ...Array.from(activePanel.querySelectorAll<HTMLElement>("*"))].forEach((element) => {
            if (element.scrollTop > 0) {
              element.scrollTop = 0;
            }
            if (element.scrollLeft > 0) {
              element.scrollLeft = 0;
            }
          });
        }
      }
    });
  };

  const resetLayout = () => {
    setLayout(normalizeLayout(defaultLayout, panelIds));
    setSizes(defaultSizes);
    window.localStorage.setItem(SCHEMA_STORAGE_KEY, String(CURRENT_LAYOUT_SCHEMA));
    setContextMenu(null);
  };

  const beginZoneResize = (event: React.PointerEvent, zoneId: DockZoneId) => {
    event.preventDefault();
    const workspace = workspaceRef.current;
    if (!workspace) {
      return;
    }
    const isHorizontalSize = zoneId === "left" || zoneId === "right";
    const startPointer = isHorizontalSize ? event.clientX : event.clientY;
    const startSize = sizes[zoneId];
    const axisLimit = isHorizontalSize ? workspace.clientWidth : workspace.clientHeight;
    const direction = zoneId === "right" || zoneId === "bottom" ? -1 : 1;
    document.body.style.cursor = isHorizontalSize ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";

    const handleMove = (moveEvent: PointerEvent) => {
      const pointer = isHorizontalSize ? moveEvent.clientX : moveEvent.clientY;
      const next = Math.max(120, Math.min(axisLimit * 0.55, startSize + (pointer - startPointer) * direction));
      setSizes((current) => ({ ...current, [zoneId]: Math.round(next) }));
    };
    const handleUp = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  const beginGroupResize = (event: React.PointerEvent, zoneId: DockZoneId, beforeId: string, afterId: string) => {
    event.preventDefault();
    const handle = event.currentTarget as HTMLDivElement;
    const before = handle.previousElementSibling as HTMLElement | null;
    const after = handle.nextElementSibling as HTMLElement | null;
    if (!before || !after) {
      return;
    }
    const horizontal = zoneId === "top" || zoneId === "bottom";
    const startPointer = horizontal ? event.clientX : event.clientY;
    const beforeSize = horizontal ? before.getBoundingClientRect().width : before.getBoundingClientRect().height;
    const afterSize = horizontal ? after.getBoundingClientRect().width : after.getBoundingClientRect().height;
    document.body.style.cursor = horizontal ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";

    const handleMove = (moveEvent: PointerEvent) => {
      const pointer = horizontal ? moveEvent.clientX : moveEvent.clientY;
      const delta = pointer - startPointer;
      const nextBefore = Math.max(100, Math.min(beforeSize + afterSize - 100, beforeSize + delta));
      const nextAfter = beforeSize + afterSize - nextBefore;
      setSizes((current) => ({
        ...current,
        groups: {
          ...current.groups,
          [beforeId]: Math.round(nextBefore),
          [afterId]: Math.round(nextAfter)
        }
      }));
    };
    const handleUp = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
  };

  const renderZone = (zoneId: DockZoneId) => {
    const groups = layout[zoneId];
    if (groups.length === 0) {
      return null;
    }
    const style = zoneId === "left" || zoneId === "right"
      ? { width: sizes[zoneId], flexBasis: sizes[zoneId] }
      : { height: sizes[zoneId], flexBasis: sizes[zoneId] };

    return (
      <section className={`dock-zone dock-zone-${zoneId}`} aria-label={`${zoneId} dock area`} style={style}>
        {groups.map((group, index) => {
          const groupSize = sizes.groups[group.id];
          const groupStyle = groupSize
            ? (zoneId === "top" || zoneId === "bottom"
              ? { width: groupSize, flexBasis: groupSize }
              : { height: groupSize, flexBasis: groupSize })
            : undefined;
          return (
            <React.Fragment key={group.id}>
              {index > 0 ? (
                <div
                  className={`dock-group-resizer ${zoneId === "top" || zoneId === "bottom" ? "vertical" : "horizontal"}`}
                  role="separator"
                  aria-label="Resize adjacent docks"
                  onPointerDown={(event) => beginGroupResize(event, zoneId, groups[index - 1].id, group.id)}
                />
              ) : null}
              <div
                className={`dock-group ${draggingPanelId ? "dock-group-drop-ready" : ""}`}
                style={groupStyle}
                onDragOver={(event) => {
                  if (draggingPanelId && !group.panelIds.includes(draggingPanelId)) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }
                }}
                onDrop={(event) => {
                  event.preventDefault();
                  if (draggingPanelId) {
                    movePanel(draggingPanelId, zoneId, group.id);
                  }
                }}
              >
                <div className="dock-tabbar">
                  <div className="dock-tabs" role="tablist">
                    {group.panelIds.map((panelId) => {
                      const panel = panelMap.get(panelId);
                      if (!panel) {
                        return null;
                      }
                      return (
                        <button
                          key={panelId}
                          className={`dock-tab ${group.activePanelId === panelId ? "active" : ""}`}
                          role="tab"
                          aria-selected={group.activePanelId === panelId}
                          draggable
                          onClick={() => setActivePanel(zoneId, group.id, panelId)}
                          onContextMenu={(event) => {
                            event.preventDefault();
                            event.stopPropagation();
                            setActivePanel(zoneId, group.id, panelId);
                            setContextMenu({ x: event.clientX, y: event.clientY, panelId });
                          }}
                          onDragStart={(event) => {
                            event.dataTransfer.effectAllowed = "move";
                            event.dataTransfer.setData("text/plain", panelId);
                            setDraggingPanelId(panelId);
                          }}
                          onDragEnd={() => setDraggingPanelId(null)}
                        >
                          <span className="dock-grip" aria-hidden="true">⋮⋮</span>
                          {panel.title}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div
                  className="dock-panel-content"
                  ref={(element) => {
                    if (element) {
                      contentRefs.current.set(group.id, element);
                    } else {
                      contentRefs.current.delete(group.id);
                    }
                  }}
                >
                  {group.panelIds.map((panelId) => {
                    const panel = panelMap.get(panelId);
                    if (!panel) {
                      return null;
                    }
                    return (
                      <div
                        key={panelId}
                        data-dock-panel-id={panelId}
                        className={`dock-panel-instance ${group.activePanelId === panelId ? "active" : "inactive"}`}
                      >
                        {panel.content}
                      </div>
                    );
                  })}
                </div>
                {draggingPanelId && !group.panelIds.includes(draggingPanelId) ? (
                  <div className="dock-merge-preview">Merge here as a tab</div>
                ) : null}
              </div>
            </React.Fragment>
          );
        })}
      </section>
    );
  };

  const contextPanel = contextMenu?.panelId ? panelMap.get(contextMenu.panelId) : null;

  return (
    <div className="dock-workspace" ref={workspaceRef}>
      <div
        className="studio-toolbar"
        onContextMenu={(event) => {
          event.preventDefault();
          setContextMenu({ x: event.clientX, y: event.clientY });
        }}
      >
        <div>
          <strong>Studio Workspace</strong>
          <span>Drag tabs to dock · drag boundaries to resize · right-click for menus</span>
        </div>
      </div>

      {renderZone("top")}
      {layout.top.length > 0 ? <div className="dock-zone-resizer horizontal" onPointerDown={(event) => beginZoneResize(event, "top")} /> : null}
      <div className="dock-middle-row">
        {renderZone("left")}
        {layout.left.length > 0 ? <div className="dock-zone-resizer vertical" onPointerDown={(event) => beginZoneResize(event, "left")} /> : null}
        <main
          className="studio-center"
          onContextMenu={(event) => {
            if (event.target === event.currentTarget) {
              event.preventDefault();
              setContextMenu({ x: event.clientX, y: event.clientY });
            }
          }}
        >
          {center}
        </main>
        {layout.right.length > 0 ? <div className="dock-zone-resizer vertical" onPointerDown={(event) => beginZoneResize(event, "right")} /> : null}
        {renderZone("right")}
      </div>
      {layout.bottom.length > 0 ? <div className="dock-zone-resizer horizontal" onPointerDown={(event) => beginZoneResize(event, "bottom")} /> : null}
      {renderZone("bottom")}

      {draggingPanelId ? (
        <div className="dock-drop-layer" aria-hidden="true">
          {zoneIds.map((zoneId) => (
            <div
              key={zoneId}
              className={`dock-edge-target dock-edge-${zoneId}`}
              onDragOver={(event) => {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
              }}
              onDrop={(event) => {
                event.preventDefault();
                movePanel(draggingPanelId, zoneId);
              }}
            >
              Dock {zoneId}
            </div>
          ))}
        </div>
      ) : null}

      {contextMenu ? (
        <ContextMenu x={contextMenu.x} y={contextMenu.y} onClose={() => setContextMenu(null)} ariaLabel="Dock menu">
          {contextPanel ? (
            <>
              <div className="context-menu-title">{contextPanel.title}</div>
              {zoneIds.map((zoneId) => (
                <button key={zoneId} role="menuitem" onClick={() => movePanel(contextPanel.id, zoneId)}>Dock {zoneId}</button>
              ))}
              <div className="context-menu-separator" />
              <button className="danger" role="menuitem" onClick={() => closePanel(contextPanel.id)}>Hide Dock</button>
            </>
          ) : (
            <>
              <div className="context-menu-title">Workspace Docks</div>
              {hiddenPanels.length === 0 ? <div className="context-menu-note">All docks are visible</div> : null}
              {hiddenPanels.map((panel) => (
                <button key={panel.id} role="menuitem" onClick={() => movePanel(panel.id, "right")}>Show {panel.title}</button>
              ))}
              <div className="context-menu-separator" />
              <button role="menuitem" onClick={resetLayout}>Reset Workspace Layout</button>
            </>
          )}
        </ContextMenu>
      ) : null}
    </div>
  );
};

export default DockWorkspace;

import React, { ReactNode, useEffect, useMemo, useState } from "react";

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

const STORAGE_KEY = "dualcast:dock-layout:v1";

const defaultLayout: DockLayout = {
  top: [],
  left: [{ id: "dock-scenes", panelIds: ["scenes"], activePanelId: "scenes" }],
  right: [
    {
      id: "dock-live",
      panelIds: ["streaming", "venue"],
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

const zoneIds: DockZoneId[] = ["top", "left", "right", "bottom"];

const cloneLayout = (layout: DockLayout): DockLayout => ({
  top: layout.top.map((group) => ({ ...group, panelIds: [...group.panelIds] })),
  left: layout.left.map((group) => ({ ...group, panelIds: [...group.panelIds] })),
  right: layout.right.map((group) => ({ ...group, panelIds: [...group.panelIds] })),
  bottom: layout.bottom.map((group) => ({ ...group, panelIds: [...group.panelIds] }))
});

const normalizeLayout = (layout: DockLayout, panelIds: Set<string>): DockLayout => {
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

const loadLayout = (panelIds: Set<string>) => {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return normalizeLayout(JSON.parse(stored) as DockLayout, panelIds);
    }
  } catch {
    // Fall back to the default workspace when saved state is invalid.
  }
  return normalizeLayout(defaultLayout, panelIds);
};

const removePanelFromLayout = (source: DockLayout, panelId: string) => {
  zoneIds.forEach((zoneId) => {
    source[zoneId] = source[zoneId]
      .map((group) => {
        const nextPanelIds = group.panelIds.filter((id) => id !== panelId);
        return {
          ...group,
          panelIds: nextPanelIds,
          activePanelId:
            group.activePanelId === panelId ? nextPanelIds[0] ?? "" : group.activePanelId
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
  const targetGroup = groupId
    ? next[zoneId].find((group) => group.id === groupId)
    : undefined;
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
  const panelMap = useMemo(() => new Map(panels.map((panel) => [panel.id, panel])), [panels]);
  const panelIds = useMemo(() => new Set(panelMap.keys()), [panelMap]);
  const [layout, setLayout] = useState<DockLayout>(() => loadLayout(panelIds));
  const [draggingPanelId, setDraggingPanelId] = useState<string | null>(null);
  const [dockMenuOpen, setDockMenuOpen] = useState(false);

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  }, [layout]);

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
  };

  const closePanel = (panelId: string) => {
    setLayout((current) => closeDockPanel(current, panelId));
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
  };

  const resetLayout = () => {
    setLayout(normalizeLayout(defaultLayout, panelIds));
    setDockMenuOpen(false);
  };

  const renderZone = (zoneId: DockZoneId) => {
    const groups = layout[zoneId];
    if (groups.length === 0) {
      return null;
    }

    return (
      <section className={`dock-zone dock-zone-${zoneId}`} aria-label={`${zoneId} dock area`}>
        {groups.map((group) => {
          const activePanel = panelMap.get(group.activePanelId) ?? panelMap.get(group.panelIds[0]);
          return (
            <div
              key={group.id}
              className={`dock-group ${draggingPanelId ? "dock-group-drop-ready" : ""}`}
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
                {activePanel ? (
                  <button
                    className="dock-close"
                    onClick={() => closePanel(activePanel.id)}
                    aria-label={`Close ${activePanel.title}`}
                    title="Hide dock"
                  >
                    ×
                  </button>
                ) : null}
              </div>
              <div className="dock-panel-content">
                {group.panelIds.map((panelId) => {
                  const panel = panelMap.get(panelId);
                  if (!panel) {
                    return null;
                  }
                  return (
                    <div
                      key={panelId}
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
          );
        })}
      </section>
    );
  };

  return (
    <div className="dock-workspace">
      <div className="studio-toolbar">
        <div>
          <strong>Studio Workspace</strong>
          <span>Drag any dock tab to rearrange the control room</span>
        </div>
        <div className="dock-menu-wrap">
          <button className="studio-toolbar-button" onClick={() => setDockMenuOpen((open) => !open)}>
            Docks
          </button>
          {dockMenuOpen ? (
            <div className="dock-menu">
              <div className="dock-menu-title">Hidden docks</div>
              {hiddenPanels.length === 0 ? <div className="dock-menu-empty">All docks are visible</div> : null}
              {hiddenPanels.map((panel) => (
                <button key={panel.id} onClick={() => movePanel(panel.id, "right")}>
                  Show {panel.title}
                </button>
              ))}
              <button className="dock-menu-reset" onClick={resetLayout}>Reset OBS layout</button>
            </div>
          ) : null}
        </div>
      </div>

      {renderZone("top")}
      <div className="dock-middle-row">
        {renderZone("left")}
        <main className="studio-center">{center}</main>
        {renderZone("right")}
      </div>
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
    </div>
  );
};

export default DockWorkspace;

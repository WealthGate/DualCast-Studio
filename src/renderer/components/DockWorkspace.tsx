import React, { ReactNode, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal, flushSync } from "react-dom";
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

export type DockSplitPosition = "before" | "after";

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
const FLOATING_STORAGE_KEY = "openchurch:floating-docks:v1";
const CURRENT_LAYOUT_SCHEMA = 5;

const defaultLayout: DockLayout = {
  top: [],
  left: [
    { id: "dock-scenes", panelIds: ["scenes"], activePanelId: "scenes" },
    { id: "dock-sources", panelIds: ["sources"], activePanelId: "sources" }
  ],
  right: [
    {
      id: "dock-live",
      panelIds: ["schedule", "streaming", "venue", "displays", "backgrounds", "lower-third", "scripture"],
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

const startPointerResize = (cursor: string, handleMove: (event: PointerEvent) => void) => {
  document.body.style.cursor = cursor;
  document.body.style.userSelect = "none";
  const handleUp = () => {
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
    window.removeEventListener("pointermove", handleMove);
    window.removeEventListener("pointerup", handleUp);
    window.removeEventListener("pointercancel", handleUp);
  };
  window.addEventListener("pointermove", handleMove);
  window.addEventListener("pointerup", handleUp);
  window.addEventListener("pointercancel", handleUp);
};

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
  const newPanelIds = [...(schemaVersion < 3 ? ["lower-third", "scripture"] : []), ...(schemaVersion < 4 ? ["schedule"] : []), "backgrounds"].filter(
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

export const splitDockPanel = (
  current: DockLayout,
  panelId: string,
  zoneId: DockZoneId,
  targetGroupId: string,
  position: DockSplitPosition
) => {
  const next = cloneLayout(current);
  const originalTarget = next[zoneId].find((group) => group.id === targetGroupId);
  if (!originalTarget || (originalTarget.panelIds.length === 1 && originalTarget.panelIds[0] === panelId)) {
    return next;
  }

  removePanelFromLayout(next, panelId);
  const targetIndex = next[zoneId].findIndex((group) => group.id === targetGroupId);
  if (targetIndex < 0) {
    return cloneLayout(current);
  }

  const insertionIndex = position === "before" ? targetIndex : targetIndex + 1;
  next[zoneId].splice(insertionIndex, 0, {
    id: `dock-${zoneId}-${Date.now()}-${panelId}`,
    panelIds: [panelId],
    activePanelId: panelId
  });
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
  focusRequest?: { panelId: string; token: number } | null;
};

type FloatingDock = { id: string; x: number; y: number; width: number; height: number };
type FloatingDrag = {
  panel: FloatingDock;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  started: boolean;
  docking: boolean;
  scrollFrame?: number;
};

const dockDropAttributes = (zone: DockZoneId, group?: string, position?: DockSplitPosition) => ({
  "data-dock-drop-zone": zone,
  "data-dock-drop-group": group,
  "data-dock-drop-position": position
});

const loadFloating = (panelIds: Set<string>): FloatingDock[] => {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(FLOATING_STORAGE_KEY) ?? "[]");
    if (!Array.isArray(saved)) return [];
    const seen = new Set<string>();
    return saved.filter((item): item is FloatingDock => {
      if (!item || !panelIds.has(item.id) || seen.has(item.id) || ![item.x, item.y, item.width, item.height].every(Number.isFinite)) return false;
      seen.add(item.id);
      return true;
    });
  } catch { return []; }
};

const fitFloating = (panel: FloatingDock, bounds: { width: number; height: number }) => {
  const width = Math.min(bounds.width, Math.max(240, panel.width));
  const height = Math.min(bounds.height, Math.max(180, panel.height));
  return {
    ...panel, width, height,
    x: Math.max(0, Math.min(bounds.width - width, panel.x)),
    y: Math.max(0, Math.min(bounds.height - height, panel.y))
  };
};

// Moving the same portal container between slots preserves editor drafts,
// scroll position, and subscriptions when a panel floats or returns to its dock.
const DockPanelSlot = ({ container, id, title, active = true }: { container: HTMLDivElement; id: string; title: string; active?: boolean }) => {
  const slotRef = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const slot = slotRef.current;
    slot?.append(container);
    return () => { if (container.parentElement === slot) container.remove(); };
  }, [container]);
  return <div ref={slotRef} id={`dock-panel-${id}`} role="tabpanel" aria-label={title}
    data-dock-panel-id={id} className={`dock-panel-instance ${active ? "active" : "inactive"}`} />;
};

const DockWorkspace: React.FC<DockWorkspaceProps> = ({ panels, center, focusRequest }) => {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const panelMap = useMemo(() => new Map(panels.map((panel) => [panel.id, panel])), [panels]);
  const panelIds = useMemo(() => new Set(panelMap.keys()), [panelMap]);
  const [layout, setLayout] = useState<DockLayout>(() => loadLayout(panelIds));
  const [locked, setLocked] = useState(() => localStorage.getItem("openchurch:docks-locked") === "true");
  useEffect(() => { localStorage.setItem("openchurch:docks-locked", String(locked)); }, [locked]);
  const [floating, setFloating] = useState(() => loadFloating(panelIds));
  const [floatBounds, setFloatBounds] = useState({ left: 0, top: 0, width: window.innerWidth, height: window.innerHeight });
  const slots = useRef(new Map<string, HTMLDivElement>());
  const getSlot = (id: string) => {
    const existing = slots.current.get(id);
    if (existing) return existing;
    const element = document.createElement("div");
    slots.current.set(id, element);
    return element;
  };
  const [sizes, setSizes] = useState<DockSizes>(loadSizes);
  const [draggingPanelId, setDraggingPanelId] = useState<string | null>(null);
  const floatingDrag = useRef<FloatingDrag | null>(null);
  const hoveredDropTarget = useRef<HTMLElement | null>(null);
  const [contextMenu, setContextMenu] = useState<DockContextMenu | null>(null);
  const handledFocusToken = useRef<number | null>(null);

  useEffect(() => {
    if (!focusRequest || !panelMap.has(focusRequest.panelId)) return;
    // Status updates recreate panelMap. A focus request must only run once,
    // otherwise live stream statistics keep pulling users back to Stream Setup.
    if (handledFocusToken.current === focusRequest.token) return;
    handledFocusToken.current = focusRequest.token;
    focusPanel(focusRequest.panelId);
  }, [focusRequest?.token, panelMap, floating]);

  function focusPanel(panelId: string) {
    if (floating.some(panel => panel.id === panelId)) {
      bringForward(panelId);
      return;
    }
    setLayout((current) => {
      const next = cloneLayout(current);
      for (const zoneId of zoneIds) {
        const group = next[zoneId].find((entry) => entry.panelIds.includes(panelId));
        if (group) {
          group.activePanelId = panelId;
          return next;
        }
      }
      if (locked) return current;
      const target = next.right[0];
      if (target) {
        target.panelIds.push(panelId);
        target.activePanelId = panelId;
      } else {
        next.right.push({ id: `dock-right-focus-${panelId}`, panelIds: [panelId], activePanelId: panelId });
      }
      return next;
    });
    window.requestAnimationFrame(() => {
      document.getElementById(`dock-tab-${panelId}`)?.scrollIntoView({ block: "nearest", inline: "nearest" });
    });
  }

  useEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(layout));
  }, [layout]);

  useEffect(() => {
    window.localStorage.setItem(SIZE_STORAGE_KEY, JSON.stringify(sizes));
  }, [sizes]);

  useEffect(() => { window.localStorage.setItem(FLOATING_STORAGE_KEY, JSON.stringify(floating)); }, [floating]);
  useLayoutEffect(() => {
    const workspace = workspaceRef.current;
    if (!workspace) return;
    const measure = () => {
      const { left, top, width, height } = workspace.getBoundingClientRect();
      setFloatBounds({ left, top, width, height });
    };
    const observer = new ResizeObserver(measure);
    observer.observe(workspace);
    window.addEventListener("resize", measure);
    measure();
    return () => { observer.disconnect(); window.removeEventListener("resize", measure); };
  }, []);

  const visiblePanelIds = useMemo(
    () => new Set([...floating.map(panel => panel.id), ...zoneIds.flatMap(zoneId => layout[zoneId].flatMap(group => group.panelIds))]),
    [layout, floating]
  );
  const docked = useMemo(() => floating.reduce((current, panel) => closeDockPanel(current, panel.id), layout), [floating, layout]);
  // Raising a floating panel changes its stack level without moving the
  // captured pointer's target to a different place in the DOM.
  const floatingLayers = floating.map((item, zIndex) => ({ item, zIndex }))
    .sort((a, b) => a.item.id.localeCompare(b.item.id));
  const hiddenPanels = panels.filter((panel) => !visiblePanelIds.has(panel.id));

  const movePanel = (panelId: string, zoneId: DockZoneId, groupId?: string) => {
    if (locked || !panelMap.has(panelId)) {
      return;
    }
    setFloating(current => current.filter(panel => panel.id !== panelId));
    setLayout((current) => moveDockPanel(current, panelId, zoneId, groupId));
    setDraggingPanelId(null);
    setContextMenu(null);
  };

  const splitPanel = (
    panelId: string,
    zoneId: DockZoneId,
    targetGroupId: string,
    position: DockSplitPosition
  ) => {
    if (locked || !panelMap.has(panelId)) {
      return;
    }
    setFloating(current => current.filter(panel => panel.id !== panelId));
    setLayout((current) => splitDockPanel(current, panelId, zoneId, targetGroupId, position));
    setDraggingPanelId(null);
    setContextMenu(null);
  };

  const closePanel = (panelId: string) => {
    if (locked) return;
    setFloating(current => current.filter(panel => panel.id !== panelId));
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
    window.requestAnimationFrame(() => document.getElementById(`dock-tab-${panelId}`)?.scrollIntoView({ block: "nearest", inline: "nearest" }));
  };

  const resetLayout = () => {
    if (locked) return;
    setFloating([]);
    setLayout(normalizeLayout(defaultLayout, panelIds));
    setSizes(defaultSizes);
    window.localStorage.setItem(SCHEMA_STORAGE_KEY, String(CURRENT_LAYOUT_SCHEMA));
    setContextMenu(null);
  };

  const floatPanel = (panelId: string) => {
    if (locked) return;
    setFloating(current => {
      if (current.some(panel => panel.id === panelId)) return current;
      const offset = (current.length % 8) * 26;
      return [...current, fitFloating({ id: panelId, x: 28 + offset, y: 42 + offset, width: 420, height: 380 }, floatBounds)];
    });
    setContextMenu(null);
  };
  const bringForward = (id: string) => setFloating(current => {
    if (current[current.length - 1]?.id === id) return current;
    const panel = current.find(item => item.id === id);
    return panel ? [...current.filter(item => item !== panel), panel] : current;
  });
  const redockPanel = (id: string) => {
    if (locked) return;
    const home = zoneIds.find(zone => layout[zone].some(group => group.panelIds.includes(id)));
    const group = home && layout[home].find(item => item.panelIds.includes(id));
    if (home && group) setActivePanel(home, group.id, id);
    setFloating(current => current.filter(panel => panel.id !== id));
    setContextMenu(null);
  };
  const adjustFloating = (panel: FloatingDock, dx: number, dy: number, resize: boolean) => {
    if (locked) return;
    const next = resize ? {
      ...panel, width: Math.min(floatBounds.width - panel.x, panel.width + dx), height: Math.min(floatBounds.height - panel.y, panel.height + dy)
    } : { ...panel, x: panel.x + dx, y: panel.y + dy };
    setFloating(current => current.map(item => item.id === panel.id ? fitFloating(next, floatBounds) : item));
  };
  const resizeFloating = (event: React.PointerEvent, panel: FloatingDock) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const { clientX, clientY } = event;
    bringForward(panel.id);
    startPointerResize("nwse-resize", move => adjustFloating(panel, move.clientX - clientX, move.clientY - clientY, true));
  };

  const dropTargetAt = (clientX: number, clientY: number) => {
    const target = document.elementFromPoint(clientX, clientY)?.closest<HTMLElement>("[data-dock-drop-zone]");
    return target && workspaceRef.current?.contains(target) ? target : null;
  };

  const highlightDropTarget = (target: HTMLElement | null) => {
    if (target === hoveredDropTarget.current) return;
    hoveredDropTarget.current?.removeAttribute("data-dock-drop-hover");
    target?.setAttribute("data-dock-drop-hover", "");
    hoveredDropTarget.current = target;
  };

  const scrollDockWorkspace = () => {
    const drag = floatingDrag.current;
    if (!drag) return;
    drag.scrollFrame = undefined;
    const workspace = workspaceRef.current;
    if (!drag.docking || !workspace || workspace.scrollHeight <= workspace.clientHeight ||
        !["auto", "scroll"].includes(getComputedStyle(workspace).overflowY)) return;
    const { left, right, top, bottom } = workspace.getBoundingClientRect();
    if (drag.x < left || drag.x >= right || drag.y < top || drag.y >= bottom ||
        dropTargetAt(drag.x, drag.y)?.classList.contains("dock-edge-target")) return;

    const margin = 36;
    const offset = Math.max(0, drag.y - bottom + margin) - Math.max(0, top + margin - drag.y);
    if (offset === 0) return;
    const before = workspace.scrollTop;
    workspace.scrollTop += Math.sign(offset) * Math.ceil(Math.abs(offset) / 3);
    if (workspace.scrollTop === before) return;
    highlightDropTarget(dropTargetAt(drag.x, drag.y));
    drag.scrollFrame = window.requestAnimationFrame(scrollDockWorkspace);
  };

  const beginFloatingDrag = (event: React.PointerEvent<HTMLButtonElement>, panel: FloatingDock) => {
    if (locked || event.button !== 0 || !event.isPrimary || floatingDrag.current) return;
    event.preventDefault();
    event.currentTarget.focus({ preventScroll: true });
    event.currentTarget.setPointerCapture(event.pointerId);
    const { clientX: x, clientY: y, pointerId } = event;
    floatingDrag.current = { panel, pointerId, startX: x, startY: y, x, y, started: false, docking: false };
  };

  const dragFloating = (event: React.PointerEvent<HTMLButtonElement>) => {
    const drag = floatingDrag.current;
    if (!drag || event.pointerId !== drag.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.started) {
      if (Math.hypot(dx, dy) < 5) return;
      drag.started = true;
    }
    const docking = !event.ctrlKey && !event.metaKey;
    if (drag.docking !== docking) {
      drag.docking = docking;
      // Render the drop targets before hit-testing the first move.
      flushSync(() => setDraggingPanelId(docking ? drag.panel.id : null));
    }
    adjustFloating(drag.panel, dx, dy, false);
    drag.x = event.clientX;
    drag.y = event.clientY;
    highlightDropTarget(docking ? dropTargetAt(event.clientX, event.clientY) : null);
    if (docking && drag.scrollFrame === undefined) drag.scrollFrame = window.requestAnimationFrame(scrollDockWorkspace);
  };

  const finishFloatingDrag = (pointerId: number, point?: React.PointerEvent<HTMLButtonElement>) => {
    const drag = floatingDrag.current;
    if (!drag || pointerId !== drag.pointerId) return;
    floatingDrag.current = null;
    if (drag.scrollFrame !== undefined) window.cancelAnimationFrame(drag.scrollFrame);
    if (!drag.started) return;

    const target = point && !point.ctrlKey && !point.metaKey ? dropTargetAt(point.clientX, point.clientY) : null;
    highlightDropTarget(null);
    setDraggingPanelId(null);
    const zone = zoneIds.find(id => id === target?.dataset.dockDropZone);
    if (zone && target) {
      const { dockDropGroup, dockDropPosition } = target.dataset;
      if (dockDropGroup && (dockDropPosition === "before" || dockDropPosition === "after")) {
        splitPanel(drag.panel.id, zone, dockDropGroup, dockDropPosition);
      } else {
        movePanel(drag.panel.id, zone, dockDropGroup);
      }
      window.requestAnimationFrame(() => document.getElementById(`dock-tab-${drag.panel.id}`)?.focus());
    } else {
      adjustFloating(drag.panel, point ? point.clientX - drag.startX : 0, point ? point.clientY - drag.startY : 0, false);
    }
  };
  const keyboardMove = (event: React.KeyboardEvent, panel: FloatingDock, resize: boolean) => {
    const step = event.shiftKey ? 40 : 12;
    const delta: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const movement = delta[event.key];
    if (!movement) return;
    event.preventDefault();
    adjustFloating(panel, ...movement, resize);
  };

  const beginZoneResize = (event: React.PointerEvent, zoneId: DockZoneId) => {
    if (locked) return;
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
    const handleMove = (moveEvent: PointerEvent) => {
      const pointer = isHorizontalSize ? moveEvent.clientX : moveEvent.clientY;
      const next = Math.max(120, Math.min(axisLimit * 0.55, startSize + (pointer - startPointer) * direction));
      setSizes((current) => ({ ...current, [zoneId]: Math.round(next) }));
    };
    startPointerResize(isHorizontalSize ? "col-resize" : "row-resize", handleMove);
  };

  const beginGroupResize = (event: React.PointerEvent, zoneId: DockZoneId, beforeId: string, afterId: string) => {
    if (locked) return;
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
    startPointerResize(horizontal ? "col-resize" : "row-resize", handleMove);
  };

  const renderZone = (zoneId: DockZoneId) => {
    const groups = docked[zoneId];
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
          const canMergeDraggedPanel = Boolean(draggingPanelId && !group.panelIds.includes(draggingPanelId));
          const canSplitDraggedPanel = Boolean(
            draggingPanelId && (canMergeDraggedPanel || group.panelIds.length > 1)
          );
          const horizontalZone = zoneId === "top" || zoneId === "bottom";
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
                className={`dock-group ${canSplitDraggedPanel ? "dock-group-drop-ready" : ""}`}
                style={groupStyle}
                {...(canMergeDraggedPanel ? dockDropAttributes(zoneId, group.id) : {})}
                onDragOver={(event) => {
                  if (canMergeDraggedPanel) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = "move";
                  }
                }}
                onDrop={(event) => {
                  if (canMergeDraggedPanel && draggingPanelId) {
                    event.preventDefault();
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
                          id={`dock-tab-${panelId}`}
                          aria-controls={`dock-panel-${panelId}`}
                          tabIndex={group.activePanelId === panelId ? 0 : -1}
                          aria-selected={group.activePanelId === panelId}
                          draggable={!locked}
                          onClick={() => setActivePanel(zoneId, group.id, panelId)}
                          onKeyDown={event => {
                            if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
                            event.preventDefault();
                            const index = group.panelIds.indexOf(panelId);
                            const count = group.panelIds.length;
                            const nextIndex = event.key === "Home" ? 0 : event.key === "End" ? count - 1
                              : (index + (event.key === "ArrowRight" ? 1 : count - 1)) % count;
                            const next = group.panelIds[nextIndex];
                            setActivePanel(zoneId, group.id, next);
                            document.getElementById(`dock-tab-${next}`)?.focus({ preventScroll: true });
                          }}
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
                  <button type="button" className="dock-float-button" disabled={locked} title="Float panel" aria-label={`Float ${panelMap.get(group.activePanelId)?.title ?? "panel"}`}
                    onClick={() => floatPanel(group.activePanelId)}>↗</button>
                </div>
                <div className="dock-panel-content">
                  {group.panelIds.map((panelId) => {
                    const panel = panelMap.get(panelId);
                    if (!panel) {
                      return null;
                    }
                    return (
                      <DockPanelSlot key={panelId} id={panelId} title={panel.title} container={getSlot(panelId)} active={group.activePanelId === panelId} />
                    );
                  })}
                </div>
                {canSplitDraggedPanel ? (
                  <div className={`dock-group-drop-overlay ${horizontalZone ? "horizontal" : "vertical"}`}>
                    <div
                      className="dock-group-split-target before"
                      {...dockDropAttributes(zoneId, group.id, "before")}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        event.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (draggingPanelId) splitPanel(draggingPanelId, zoneId, group.id, "before");
                      }}
                    >
                      {horizontalZone ? "Dock left" : "Dock above"}
                    </div>
                    {canMergeDraggedPanel ? (
                      <div
                        className="dock-group-merge-target"
                        {...dockDropAttributes(zoneId, group.id)}
                        onDragOver={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          event.dataTransfer.dropEffect = "move";
                        }}
                        onDrop={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          if (draggingPanelId) movePanel(draggingPanelId, zoneId, group.id);
                        }}
                      >
                        Tab here
                      </div>
                    ) : <div className="dock-group-merge-target unavailable">Current tab</div>}
                    <div
                      className="dock-group-split-target after"
                      {...dockDropAttributes(zoneId, group.id, "after")}
                      onDragOver={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        event.dataTransfer.dropEffect = "move";
                      }}
                      onDrop={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        if (draggingPanelId) splitPanel(draggingPanelId, zoneId, group.id, "after");
                      }}
                    >
                      {horizontalZone ? "Dock right" : "Dock below"}
                    </div>
                  </div>
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
    <div data-layout-locked={locked || undefined} className={`dock-workspace${draggingPanelId ? " dock-drag-active" : ""}`} ref={workspaceRef}>
      <div
        className="studio-toolbar"
        onContextMenu={(event) => {
          event.preventDefault();
          setContextMenu({ x: event.clientX, y: event.clientY });
        }}
      >
        <div>
          <strong>Studio Workspace</strong>
        </div>
        <button type="button" className="studio-toolbar-button" aria-haspopup="menu" aria-expanded={Boolean(contextMenu && !contextMenu.panelId)}
          onClick={event => {
            const bounds = event.currentTarget.getBoundingClientRect();
            setContextMenu({ x: bounds.right - 255, y: bounds.bottom + 5 });
          }}>{locked ? "Panels (locked)" : "Panels"}</button>
      </div>

      {renderZone("top")}
      {docked.top.length > 0 ? <div className="dock-zone-resizer horizontal" onPointerDown={(event) => beginZoneResize(event, "top")} /> : null}
      <div className="dock-middle-row">
        {renderZone("left")}
        {docked.left.length > 0 ? <div className="dock-zone-resizer vertical" onPointerDown={(event) => beginZoneResize(event, "left")} /> : null}
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
        {docked.right.length > 0 ? <div className="dock-zone-resizer vertical" onPointerDown={(event) => beginZoneResize(event, "right")} /> : null}
        {renderZone("right")}
      </div>
      {docked.bottom.length > 0 ? <div className="dock-zone-resizer horizontal" onPointerDown={(event) => beginZoneResize(event, "bottom")} /> : null}
      {renderZone("bottom")}

      <div className="dock-float-layer" style={floatBounds}>
        {floatingLayers.map(({ item, zIndex }) => {
          const panel = panelMap.get(item.id);
          if (!panel) return null;
          const { x, y, width, height } = fitFloating(item, floatBounds);
          const bounds = { id: item.id, x, y, width, height };
          return <section key={item.id} className="dock-group floating-dock" aria-label={`Floating ${panel.title}`}
            data-dock-dragging={draggingPanelId === item.id || undefined}
            style={{ left: x, top: y, width, height, zIndex }} onPointerDownCapture={() => bringForward(item.id)} onFocusCapture={() => bringForward(item.id)}>
            <div className="dock-tabbar floating-dock-header">
              <button type="button" className="floating-dock-title" disabled={locked} aria-label={`Move ${panel.title}`} title="Drag to dock. Hold Ctrl or Cmd to keep floating. Use the arrow keys to move."
                onPointerDown={event => beginFloatingDrag(event, bounds)} onPointerMove={dragFloating}
                onPointerUp={event => finishFloatingDrag(event.pointerId, event)}
                onPointerCancel={event => finishFloatingDrag(event.pointerId)}
                onLostPointerCapture={event => finishFloatingDrag(event.pointerId)}
                onContextMenu={event => { event.preventDefault(); setContextMenu({ x: event.clientX, y: event.clientY, panelId: item.id }); }}
                onKeyDown={event => keyboardMove(event, bounds, false)}>{panel.title}</button>
              <button type="button" className="dock-float-button" disabled={locked} title="Return to dock" aria-label={`Dock ${panel.title}`} onClick={() => redockPanel(item.id)}>↙</button>
            </div>
            <div className="dock-panel-content"><DockPanelSlot id={item.id} title={panel.title} container={getSlot(item.id)} /></div>
            <button type="button" className="floating-dock-resize" disabled={locked} aria-label={`Resize ${panel.title}`} title="Drag or use the arrow keys to resize"
              onPointerDown={event => resizeFloating(event, bounds)} onKeyDown={event => keyboardMove(event, bounds, true)} />
          </section>;
        })}
      </div>
      {panels.filter(panel => visiblePanelIds.has(panel.id)).map(panel => createPortal(panel.content, getSlot(panel.id), panel.id))}

      {draggingPanelId ? (
        <div className="dock-drop-layer" aria-hidden="true" style={floatBounds}>
          {zoneIds.map((zoneId) => (
            <div
              key={zoneId}
              className={`dock-edge-target dock-edge-${zoneId}`}
              {...dockDropAttributes(zoneId)}
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
          <button role="menuitem" onClick={() => { setLocked(!locked); setContextMenu(null); }}>{locked ? "Unlock dock layout" : "Lock dock layout"}</button>
          {contextPanel ? (
            <>
              <div className="context-menu-title">{contextPanel.title}</div>
              {floating.some(panel => panel.id === contextPanel.id)
                ? <button disabled={locked} role="menuitem" onClick={() => redockPanel(contextPanel.id)}>Return to previous dock</button>
                : <button disabled={locked} role="menuitem" onClick={() => floatPanel(contextPanel.id)}>Float Panel</button>}
              {zoneIds.map((zoneId) => (
                <button key={zoneId} disabled={locked} role="menuitem" onClick={() => movePanel(contextPanel.id, zoneId)}>Dock {zoneId}</button>
              ))}
              <div className="context-menu-separator" />
              <button className="danger" disabled={locked} role="menuitem" onClick={() => closePanel(contextPanel.id)}>Hide Dock</button>
            </>
          ) : (
            <>
              <div className="context-menu-title">Workspace Docks</div>
              {panels.map((panel) => (
                <button key={panel.id} disabled={locked && hiddenPanels.includes(panel)} role="menuitem" onClick={() => {
                  focusPanel(panel.id);
                  setContextMenu(null);
                }}>{hiddenPanels.includes(panel) ? `Show ${panel.title}` : panel.title}</button>
              ))}
              <div className="context-menu-separator" />
              <button disabled={locked} role="menuitem" onClick={resetLayout}>Reset Workspace Layout</button>
            </>
          )}
        </ContextMenu>
      ) : null}
    </div>
  );
};

export default DockWorkspace;

import { describe, expect, it } from "vitest";
import { closeDockPanel, DockLayout, moveDockPanel } from "../DockWorkspace";

const layout = (): DockLayout => ({
  top: [],
  left: [{ id: "scenes-group", panelIds: ["scenes"], activePanelId: "scenes" }],
  right: [{ id: "live-group", panelIds: ["streaming", "venue"], activePanelId: "streaming" }],
  bottom: [{ id: "controls-group", panelIds: ["controls"], activePanelId: "controls" }]
});

describe("dock layout", () => {
  it("merges a moved panel into the target group as the active tab", () => {
    const next = moveDockPanel(layout(), "streaming", "bottom", "controls-group");

    expect(next.right[0].panelIds).toEqual(["venue"]);
    expect(next.bottom[0].panelIds).toEqual(["controls", "streaming"]);
    expect(next.bottom[0].activePanelId).toBe("streaming");
  });

  it("creates a new group when dropped on a dock edge", () => {
    const next = moveDockPanel(layout(), "venue", "top");

    expect(next.right[0].panelIds).toEqual(["streaming"]);
    expect(next.top).toHaveLength(1);
    expect(next.top[0].panelIds).toEqual(["venue"]);
  });

  it("removes empty groups when a panel is hidden", () => {
    const next = closeDockPanel(layout(), "scenes");

    expect(next.left).toEqual([]);
  });
});

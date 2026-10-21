import { describe, expect, it } from "vitest";
import { defaultScrollingText, normalizeScrollingText } from "../scrollingText";
import { normalizeStudioState } from "../settings";

describe("scrolling message settings", () => {
  it("recovers defaults and clamps damaged settings", () => {
    expect(normalizeScrollingText(null)).toEqual(defaultScrollingText);
    expect(normalizeScrollingText({ speed: -10, fontSize: 900, backgroundOpacity: 10, logoWidthPercent: 99, direction: "diagonal" })).toMatchObject({ speed: 0, fontSize: 400, backgroundOpacity: 1, logoWidthPercent: 40, direction: "left" });
  });
  it("preserves the message, local images, logo and animation through persisted studio recovery", () => {
    const data = normalizeScrollingText({ text: "Welcome\nNext event", logoUrl: "file:///logo.png", logoPosition: "right", backgroundImageUrl: "file:///banner.png", direction: "up", speed: 85, italic: true, loop: false });
    const state = normalizeStudioState(JSON.parse(JSON.stringify({ scenes: [{ id: "scene", name: "Welcome", sourceIds: ["ticker"] }], sources: { ticker: { id: "ticker", name: "Ticker", type: "scrolling-text", enabled: true, audioEnabled: false, rect: { x: 0, y: 88, width: 100, height: 12 }, media: { paused: true, restartToken: 3 }, data } }, previewSceneId: "scene", programSceneId: "scene" })));
    expect(state.sources.ticker).toMatchObject({ type: "scrolling-text", data, media: { paused: true, restartToken: 3 } });
  });
});

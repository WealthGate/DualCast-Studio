import { describe, expect, it } from "vitest";
import { adjacentScheduleCue, normalizeServiceSchedules } from "../serviceSchedules";
describe("saved service schedules", () => {
  it("keeps independent scene and slide snapshots and cleans Scripture", () => {
    const input = [{ id: "service", name: "Sunday", date: "2026-10-25", items: [
      { id: "scene", title: "Welcome", kind: "scene", scene: { id: "a", name: "Welcome", sourceIds: ["text"] }, sources: { text: { id: "text", name: "Welcome", type: "text", enabled: true, audioEnabled: false, rect: { x: 0, y: 0, width: 100, height: 100 }, data: { text: "Welcome", fontSize: 48 } } } },
      { id: "reading", title: "Reading", kind: "slides", slides: [{ id: "v", text: "&lt;span&gt;God is love&lt;/span&gt;", kind: "scripture" }] },
      { id: "note", title: "Prayer", kind: "note", minutes: 5 }
    ] }];
    const saved = normalizeServiceSchedules(input);
    input[0].items[0].title = "Changed";
    expect(saved[0].items[0].title).toBe("Welcome");
    expect(saved[0].items[1]).toMatchObject({ kind: "slides", slides: [{ text: "God is love" }] });
    expect(normalizeServiceSchedules(JSON.parse(JSON.stringify(saved)))).toEqual(saved);
  });
  it("ignores duplicate IDs and invalid entries", () => {
    expect(normalizeServiceSchedules([{ id: "a", items: [{ id: "bad", kind: "slides", slides: [] }, { id: "note", kind: "note" }, { id: "note", kind: "note" }] }, { id: "a" }])[0].items).toHaveLength(1);
  });
  it("moves through all slides before the next service item and does not wrap at the end", () => {
    const items = normalizeServiceSchedules([{ id: "a", items: [{ id: "song", kind: "slides", slides: [{ id: "1", text: "One" }, { id: "2", text: "Two" }] }, { id: "note", kind: "note" }] }])[0].items;
    expect(adjacentScheduleCue(items, -1, 0, 1)).toEqual({ index: 0, slide: 0 });
    expect(adjacentScheduleCue(items, 0, 0, 1)).toEqual({ index: 0, slide: 1 });
    expect(adjacentScheduleCue(items, 0, 1, 1)).toEqual({ index: 1, slide: 0 });
    expect(adjacentScheduleCue(items, 1, 0, -1)).toEqual({ index: 0, slide: 1 });
    expect(adjacentScheduleCue(items, 1, 0, 1)).toBeNull();
  });
});

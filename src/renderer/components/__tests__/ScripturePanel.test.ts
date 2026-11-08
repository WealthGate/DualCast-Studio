import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import * as appStore from "../../store/useAppStore";
import ScripturePanel from "../ScripturePanel";

describe("Scripture controls", () => {
  it("places live, navigation, slide and offline actions beside the reference picker", () => {
    const html = renderToStaticMarkup(React.createElement(ScripturePanel));
    const picker = html.slice(html.indexOf('class="scripture-reference-picker"'), html.indexOf('class="scripture-direct-reference"'));
    for (const label of ["Show Live (Enter)", "Hide Scripture", "Previous Verse", "Next Verse", "Create Slides in Preview", "Save Passage Offline"]) {
      expect(picker).toContain(label);
    }
    expect(picker).toContain("Jump to verse");
    expect(picker).toContain('aria-label="Bible verse"');
    expect(picker).toContain('aria-label="Through verse"');
    expect(picker).toContain("Jump live");
    expect(html).not.toContain("Load Reference");
    expect(html).not.toContain("Load John");
    expect(html.match(/Create Slides in Preview/g)).toHaveLength(1);
    expect(html.match(/Save Passage Offline/g)).toHaveLength(1);
  });
  it("keeps a saved offline source selected even if the library is unavailable", () => {
    const state = appStore.useAppStore.getState();
    const offline = { ...state, settings: { ...state.settings, scriptureSourceId: "saved-library" } };
    const mock = vi.spyOn(appStore, "useAppStore").mockImplementation((selector?: (value: typeof state) => unknown) => (selector ? selector(offline) : offline) as never);
    try {
      const html = renderToStaticMarkup(React.createElement(ScripturePanel));
      expect(html).toContain('value="saved-library" selected=""');
    } finally {
      mock.mockRestore();
    }
  });
});

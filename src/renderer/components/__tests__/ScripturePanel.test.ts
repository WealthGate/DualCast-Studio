import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ScripturePanel from "../ScripturePanel";

describe("Scripture controls", () => {
  it("places live, navigation, slide and offline actions beside the reference picker", () => {
    const html = renderToStaticMarkup(React.createElement(ScripturePanel));
    const picker = html.slice(html.indexOf('class="scripture-reference-picker"'), html.indexOf('class="scripture-direct-reference"'));
    for (const label of ["Show Live (Enter)", "Previous Verse", "Next Verse", "Create Slides in Preview", "Save Passage Offline"]) {
      expect(picker).toContain(label);
    }
    expect(html).not.toContain("Load Reference");
    expect(html).not.toContain("Load John");
    expect(html.match(/Create Slides in Preview/g)).toHaveLength(1);
    expect(html.match(/Save Passage Offline/g)).toHaveLength(1);
  });
});

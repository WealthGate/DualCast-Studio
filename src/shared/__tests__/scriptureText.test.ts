import { describe, expect, it } from "vitest";
import { sanitizeScriptureText } from "../scriptureText";

describe("Scripture text sanitization", () => {
  const john317 = "For God sent not his Son into the world to condemn the world; but that the world through him might be saved.";

  it.each([
    `‹${john317}›`,
    `<${john317}>`,
    `&lsaquo;${john317}&rsaquo;`,
    `&#8249;${john317}&#8250;`,
    `&#x2039;${john317}&#x203a;`,
    `<p>‹${john317}›</p>`
  ])("permanently removes John 3:17 source delimiters: %s", (input) => {
    expect(sanitizeScriptureText(input)).toBe(john317);
    expect(sanitizeScriptureText(sanitizeScriptureText(input))).toBe(john317);
  });

  it("removes embedded angle artifacts without changing genuine punctuation", () => {
    expect(sanitizeScriptureText('“Jesus’ words,” ‹he said›; <come now> &amp; see!'))
      .toBe('“Jesus’ words,” he said; come now & see!');
  });

  it("removes encoded markup, verse markers and footnotes while preserving punctuation", () => {
    expect(sanitizeScriptureText('&lt;p&gt;For God<sup>16</sup> so loved [a] the world &amp; all people!&lt;/p&gt;'))
      .toBe("For God so loved the world & all people!");
  });
  it("removes API markup without removing the verse", () => {
    expect(sanitizeScriptureText('<p><span class="v">For God so loved</span> the world.</p>')).toBe("For God so loved the world.");
  });

  it("removes stray wrapping angle brackets shown by some libraries", () => {
    expect(sanitizeScriptureText("<For God so loved the world.>")).toBe("For God so loved the world.");
  });

  it("decodes common and numeric entities", () => {
    expect(sanitizeScriptureText("Jesus &amp; his disciples&#39; friends")).toBe("Jesus & his disciples' friends");
  });
});

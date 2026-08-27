import { describe, expect, it } from "vitest";
import { sanitizeScriptureText } from "../scriptureText";

describe("Scripture text sanitization", () => {
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

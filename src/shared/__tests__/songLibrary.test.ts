import { describe, expect, it } from "vitest";
import { normalizeSong } from "../../../electron/services/songService";

describe("song library normalization", () => {
  it("accepts plain-text lyrics", () => {
    expect(normalizeSong("Verse one\nVerse two", "My Song")).toMatchObject({
      title: "My Song",
      lyrics: "Verse one\nVerse two"
    });
  });

  it("accepts JSON songs made from ordered slides", () => {
    expect(normalizeSong({ title: "Grace", slides: ["First line", { text: "Second line" }] }, "Fallback"))
      .toMatchObject({ title: "Grace", lyrics: "First line\n\nSecond line" });
  });

  it("rejects an empty song document", () => {
    expect(() => normalizeSong({ title: "Empty" }, "Fallback")).toThrow(/contains no lyrics/i);
  });
});

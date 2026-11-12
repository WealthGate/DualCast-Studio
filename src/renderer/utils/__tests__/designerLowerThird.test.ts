import { describe, expect, it } from "vitest";
import { wrapLowerThirdText } from "../designerLowerThird";
describe("lower third text fitting", () => {
  it("wraps long words without dropping characters and preserves intentional line breaks", () => {
    const measure = (text: string) => Array.from(text).length * 10;
    expect(wrapLowerThirdText("Faithfulness\nHope and love", 50, measure)).toEqual(["Faith", "fulne", "ss", "Hope", "and", "love"]);
    expect(wrapLowerThirdText("One\n\nTwo", 100, measure)).toEqual(["One", "", "Two"]);
    expect(wrapLowerThirdText("🎵🎵🎵", 20, measure)).toEqual(["🎵🎵", "🎵"]);
  });
});

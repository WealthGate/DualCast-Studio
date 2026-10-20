import { describe, expect, it } from "vitest";
import { getSanctuaryDisplayState } from "../sanctuaryContent";
import { useAppStore } from "../../store/useAppStore";
import { defaultSanctuaryDisplay } from "../../../shared/sanctuaryDisplay";

const state = () => {
  const base = useAppStore.getState();
  return { ...base, settings: { ...base.settings,
    sanctuaryDisplay: { ...defaultSanctuaryDisplay, mode: "independent" as const },
    lowerThird: { ...base.settings.lowerThird, programSlideId: "live", activeSlideId: "staged", slides: [
      { id: "live", text: "Live verse", reference: "John 3:16" }, { id: "staged", text: "Next verse" }
    ] }
  }, displayTextMode: "show" as const, isLowerThirdHidden: false };
};
describe("Independent sanctuary content", () => {
  it("follows the committed live cue without changing Program styling", () => {
    const original = state();
    const output = getSanctuaryDisplayState(original);
    expect(output.text).toBe("Live verse");
    expect(output.reference).toBe("John 3:16");
    expect(original.settings.lowerThird.fontSize).toBe(48);
    expect(output.settings.fontSize).toBe(72);
  });
  it("removes hidden lower thirds but keeps independent custom text", () => {
    const original = state(); original.isLowerThirdHidden = true;
    expect(getSanctuaryDisplayState(original).text).toBe("");
    const custom = { ...original, settings: { ...original.settings, sanctuaryDisplay: { ...original.settings.sanctuaryDisplay, textSource: "custom" as const, customText: "Welcome" } } };
    expect(getSanctuaryDisplayState(custom).text).toBe("Welcome");
  });
  it("sends global hide-text mode without clearing the live content", () => {
    const original = state();
    const output = getSanctuaryDisplayState({ ...original, displayTextMode: "hide" });
    expect(output.textMode).toBe("hide");
    expect(output.text).toBe("Live verse");
  });
});

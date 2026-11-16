import { describe, expect, it } from "vitest";
import { getOutputProfile, normalizeVideoResolution, resolutionSize } from "../recording";

describe("explicit video resolutions", () => {
  it("supports HD through 8K independently of compression", () => {
    expect(resolutionSize("8k")).toEqual({width:7680,height:4320});
    expect(getOutputProfile("low","4k")).toMatchObject({maxWidth:3840,maxHeight:2160});
    expect(getOutputProfile("high","1080p").maxWidth).toBe(1920);
    expect(getOutputProfile("high","auto").maxWidth).toBe(1920);
    expect(normalizeVideoResolution("999999999p")).toBe("auto");
  });
  it("scales recording bitrate for high pixel counts", () => {
    expect(getOutputProfile("medium","8k").videoBitsPerSecond).toBe(96_000_000);
  });
});

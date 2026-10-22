import { describe, expect, it } from "vitest";
import { streamingProfile } from "../streamingProfile";
describe("streaming load at selected resolutions", () => {
  it("reduces 720p bitrate even with High compression quality", () => {
    expect(streamingProfile("high","720p",30)).toEqual({width:1280,height:720,videoBitsPerSecond:2_889_000});
    expect(streamingProfile("high","1080p",60).videoBitsPerSecond).toBe(6_500_000);
  });
  it("retains the requested raster and scales explicit 4K/8K bitrates", () => {
    expect(streamingProfile("medium","4k").width).toBe(3840);
    expect(streamingProfile("medium","8k").videoBitsPerSecond).toBe(72_000_000);
  });
});

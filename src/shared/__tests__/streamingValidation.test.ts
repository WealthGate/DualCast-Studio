import { describe, expect, it } from "vitest";
import { isValidRtmpUrl } from "../streamingValidation";

describe("isValidRtmpUrl", () => {
  it("accepts RTMP and RTMPS endpoints", () => {
    expect(isValidRtmpUrl("rtmp://example.test/live")).toBe(true);
    expect(isValidRtmpUrl("rtmps://example.test/live")).toBe(true);
  });

  it("rejects unrelated or malformed endpoints", () => {
    expect(isValidRtmpUrl("https://example.test/live")).toBe(false);
    expect(isValidRtmpUrl("not a URL")).toBe(false);
  });
});

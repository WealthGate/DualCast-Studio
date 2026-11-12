import { describe, expect, it } from "vitest";
import { pickSupportedRecorderMimeType } from "../media";

describe("MediaRecorder MIME selection", () => {
  it("uses the first supported type in caller priority order", () => {
    expect(pickSupportedRecorderMimeType(["vp8", "vp9"], (value) => value === "vp9")).toBe("vp9");
  });
});

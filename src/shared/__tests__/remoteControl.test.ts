import { describe, expect, it } from "vitest";
import { isRemoteCommand, normalizeRemoteUrl } from "../remoteControl";

describe("remote command allowlist", () => {
  it("rejects arbitrary actions and incorrectly typed or excessive parameters", () => {
    for (const command of [null, [], { action: "startStream", key: "secret" }, { action: "record", enabled: "yes" },
      { action: "master-gain", gain: NaN }, { action: "master-gain", gain: 1.1 },
      { action: "text-stage", text: "x".repeat(10001), title: "Title", lines: 2 },
      { action: "text-stage", text: "Words", title: "Title", lines: 1.5 },
      { action: "take", transition: ["cut"] }, { action: "text-mode", mode: ["show"] },
      { action: "scene-live", sceneId: "" }, { action: "slide-step", direction: 2, live: true }]) expect(isRemoteCommand(command)).toBe(false);
    expect(isRemoteCommand({ action: "record", enabled: true })).toBe(true);
  });
  it("accepts only credential-free HTTPS roots or the operator entry point", () => {
    expect(normalizeRemoteUrl(" https://studio.example.ts.net/operator ")).toBe("https://studio.example.ts.net");
    for (const url of ["http://public.example", "https://user:pass@public.example", "https://public.example/subpath", "https://public.example?pin=123456", "javascript:alert(1)"]) expect(normalizeRemoteUrl(url)).toBe("");
  });
});

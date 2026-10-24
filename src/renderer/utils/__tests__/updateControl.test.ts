import { describe, expect, it } from "vitest";
import { getUpdateControlView, normalizeVersion } from "../updateControl";

describe("update control", () => {
  it("shows the installed application version before an update check", () => {
    expect(getUpdateControlView(null, "0.6.2")).toMatchObject({
      action: "check",
      label: "Check for Updates",
      detail: "Installed v0.6.2"
    });
  });

  it("offers the detected newer version for download", () => {
    expect(getUpdateControlView({
      state: "available",
      currentVersion: "0.6.2",
      latestVersion: "0.7.0"
    }, "0.6.2")).toMatchObject({
      action: "download",
      label: "Update to v0.7.0",
      detail: "Installed v0.6.2",
      disabled: false
    });
  });

  it("offers installation after the update has downloaded", () => {
    expect(getUpdateControlView({
      state: "downloaded",
      currentVersion: "0.6.2",
      latestVersion: "v0.7.0",
      progressPercent: 100
    }, "0.6.2")).toMatchObject({
      action: "install",
      label: "Restart & Install",
      detail: "v0.7.0 is ready"
    });
  });

  it("normalizes version labels without adding a second v prefix", () => {
    expect(normalizeVersion("v0.7.0")).toBe("0.7.0");
  });
});

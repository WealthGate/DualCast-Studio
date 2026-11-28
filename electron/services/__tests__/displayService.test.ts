import { beforeEach, describe, expect, it, vi } from "vitest";

const { getAllDisplays, getPrimaryDisplay } = vi.hoisted(() => ({
  getAllDisplays: vi.fn(),
  getPrimaryDisplay: vi.fn()
}));

vi.mock("electron", () => ({
  desktopCapturer: { getSources: vi.fn() },
  screen: { getAllDisplays, getPrimaryDisplay }
}));

import { listProjectionDisplays } from "../displayService";

describe("projection display discovery", () => {
  beforeEach(() => {
    getPrimaryDisplay.mockReturnValue({ id: 1 });
    getAllDisplays.mockReturnValue([
      { id: 2, label: "Sanctuary Projector", size: { width: 1920, height: 1080 } },
      { id: 1, label: "", size: { width: 2560, height: 1440 } }
    ]);
  });

  it("lists Electron monitors independently of desktop-capture metadata", () => {
    expect(listProjectionDisplays()).toEqual([
      { id: "1", name: "Primary display", isPrimary: true, size: { width: 2560, height: 1440 } },
      { id: "2", name: "Sanctuary Projector", isPrimary: false, size: { width: 1920, height: 1080 } }
    ]);
  });
});

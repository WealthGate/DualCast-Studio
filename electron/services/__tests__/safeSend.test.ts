import { describe, expect, it, vi } from "vitest";
import { safeSend, sendToWindow } from "../safeSend";

describe("renderer shutdown sends", () => {
  it("skips a destroyed renderer even when its BrowserWindow is still alive", () => {
    const send = vi.fn(() => { throw Error("Object has been destroyed"); });
    const window = { isDestroyed: () => false, webContents: { isDestroyed: () => true, send } };
    expect(sendToWindow(window as any, "status", {})).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
  it("handles destruction between checking and sending", () => {
    const contents = { isDestroyed: () => false, send: () => { throw Error("Object has been destroyed"); } };
    expect(safeSend(contents as any, "status")).toBe(false);
  });
  it("keeps delivering to live recipients and surfaces unrelated programming errors", () => {
    const contents = { isDestroyed: () => false, send: vi.fn() };
    expect(safeSend(contents as any, "status", 42)).toBe(true);
    expect(contents.send).toHaveBeenCalledWith("status", 42);
    contents.send.mockImplementation(() => { throw Error("Invalid channel"); });
    expect(() => safeSend(contents as any, "bad")).toThrow("Invalid channel");
  });
});

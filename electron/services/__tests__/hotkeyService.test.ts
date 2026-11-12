import { beforeEach, describe, expect, it, vi } from "vitest";
const shortcuts = vi.hoisted(() => ({ register: vi.fn((_key: string, _callback: () => void) => true), unregisterAll: vi.fn() }));
vi.mock("electron", () => ({ globalShortcut: shortcuts }));
import { configureHotkeys, registerHotkeys, unregisterHotkeys } from "../hotkeyService";

describe("custom hotkeys", () => {
  beforeEach(() => {
    unregisterHotkeys();
    shortcuts.register.mockReset().mockReturnValue(true);
    shortcuts.unregisterAll.mockClear();
  });
  it("dispatches configured actions and allows disabled bindings", () => {
    const send = vi.fn();
    registerHotkeys(() => ({ isDestroyed: () => false, webContents: { send } }) as any);
    shortcuts.register.mockClear();
    configureHotkeys({ take: "F8", "toggle-record": "F9", "cut-black": "" });
    expect(shortcuts.register.mock.calls.map(call => call[0])).toEqual(["F8", "F9"]);
    (shortcuts.register.mock.calls[0] as unknown as [string, () => void])[1]();
    expect(send).toHaveBeenCalledWith("dualcast:hotkey", { action: "take" });
  });
  it("restores the previous shortcuts when a new shortcut is unavailable", () => {
    registerHotkeys(() => null);
    configureHotkeys({ take: "F8", "toggle-record": "F9", "cut-black": "" });
    shortcuts.register.mockClear();
    shortcuts.register.mockReturnValueOnce(false);
    expect(() => configureHotkeys({ take: "F10", "toggle-record": "F9", "cut-black": "" })).toThrow("already in use");
    expect(shortcuts.register.mock.calls.map(call => call[0])).toEqual(["F10", "F8", "F9"]);
  });
});


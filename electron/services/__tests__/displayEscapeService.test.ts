import type { BrowserWindow, Input } from "electron";
import { describe, expect, it, vi } from "vitest";
import { registerDisplayEscape } from "../displayEscapeService";

const setup = (active: boolean) => {
  const on = vi.fn();
  const stopDisplays = vi.fn(() => active);
  const studio = { isDestroyed: () => false, isMinimized: () => true, restore: vi.fn(), show: vi.fn(), focus: vi.fn() };
  registerDisplayEscape({ webContents: { on } } as unknown as BrowserWindow,
    stopDisplays, () => studio as unknown as BrowserWindow);
  const event = { preventDefault: vi.fn() };
  const press = (key: string, type = "keyDown") => on.mock.calls[0][1](event, { key, type } as Input);
  return { press, event, stopDisplays, studio };
};

describe("Escape display exit", () => {
  it("stops displays and restores focus to the studio on Escape", () => {
    const { press, event, stopDisplays, studio } = setup(true);
    press("Escape");
    expect(stopDisplays).toHaveBeenCalledOnce();
    expect(event.preventDefault).toHaveBeenCalledOnce();
    expect(studio.restore).toHaveBeenCalledOnce();
    expect(studio.show).toHaveBeenCalledOnce();
    expect(studio.focus).toHaveBeenCalledOnce();
  });

  it("leaves normal Escape handling available when no displays are open", () => {
    const { press, event, studio } = setup(false);
    press("Escape");
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(studio.focus).not.toHaveBeenCalled();
  });

  it("ignores other keys and Escape key release", () => {
    const { press, stopDisplays } = setup(true);
    press("Enter");
    press("Escape", "keyUp");
    expect(stopDisplays).not.toHaveBeenCalled();
  });
});

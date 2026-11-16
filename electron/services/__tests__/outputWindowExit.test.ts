import { afterEach, describe, expect, it, vi } from "vitest";
import { createOutputWindowExit } from "../outputWindowExit";
const window = () => ({ isDestroyed: () => false, setOpacity: vi.fn(), close: vi.fn(), webContents: { executeJavaScript: vi.fn(() => Promise.resolve()) } });
afterEach(() => { vi.useRealTimers(); });
describe("animated display exit", () => {
  it("closes only after fading, with one close for duplicate requests", async () => {
    vi.useFakeTimers(); const output = window(), exit = createOutputWindowExit();
    const first = exit.close(output, 400), second = exit.close(output, 400);
    await vi.advanceTimersByTimeAsync(200); expect(output.close).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(220); await Promise.all([first, second]);
    expect(output.close).toHaveBeenCalledOnce();
  });
  it("cancels closing when the display is reopened", async () => {
    vi.useFakeTimers(); const output = window(), exit = createOutputWindowExit();
    const closing = exit.close(output, 400);
    await vi.advanceTimersByTimeAsync(200); exit.cancel(output); await closing;
    await vi.advanceTimersByTimeAsync(500);
    expect(output.close).not.toHaveBeenCalled(); expect(output.setOpacity).toHaveBeenLastCalledWith(1);
  });
  it("finishes even when the output renderer never acknowledges the animation", async () => {
    vi.useFakeTimers(); const output = window(), exit = createOutputWindowExit();
    output.webContents.executeJavaScript.mockImplementation(() => new Promise(() => {}));
    const closing = exit.close(output, 100);
    await vi.advanceTimersByTimeAsync(120); await closing; expect(output.close).toHaveBeenCalledOnce();
  });
});

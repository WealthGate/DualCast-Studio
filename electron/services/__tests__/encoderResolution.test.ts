import { EventEmitter } from "events";
import { PassThrough } from "stream";
import { afterEach, describe, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ spawn: vi.fn() }));
vi.mock("child_process", () => ({ spawn: mocks.spawn }));
import { supportsStreamResolution } from "../encoderResolution";
describe("8K encoder validation", () => {
  afterEach(() => vi.useRealTimers());
  const child = () => {
    const process = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() });
    mocks.spawn.mockReturnValue(process); return process;
  };
  it("requires the encoder to complete a real 8K probe", async () => {
    const process = child(), supported = supportsStreamResolution("ffmpeg", "nvenc", 60, null);
    expect(mocks.spawn).toHaveBeenLastCalledWith("ffmpeg", expect.arrayContaining(["color=c=black:s=7680x4320:r=60"]), { windowsHide: true });
    process.emit("close", 0); expect(await supported).toBe(true);
  });
  it("rejects driver failures instead of silently falling back to CPU at 8K", async () => {
    const process = child(), supported = supportsStreamResolution("ffmpeg", "qsv", 60, null);
    process.emit("close", 1); expect(await supported).toBe(false);
  });
  it("terminates only its own probe when a driver stalls", async () => {
    vi.useFakeTimers(); const process = child(), supported = supportsStreamResolution("ffmpeg", "qsv", 60, null);
    await vi.advanceTimersByTimeAsync(5000);
    expect(await supported).toBe(false); expect(process.kill).toHaveBeenCalledOnce();
  });
});

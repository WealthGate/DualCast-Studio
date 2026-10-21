import { EventEmitter } from "events";
import { PassThrough } from "stream";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), getSources: vi.fn(), getAllDisplays: vi.fn(), dipToScreenRect: vi.fn() }));
vi.mock("electron", () => ({ desktopCapturer: { getSources: mocks.getSources }, screen: { getAllDisplays: mocks.getAllDisplays, dipToScreenRect: mocks.dipToScreenRect } }));
vi.mock("child_process", () => ({ spawn: mocks.spawn }));
vi.mock("../ffmpegPathService", () => ({ resolveFfmpegExecutablePath: () => "ffmpeg.exe" }));
import { startCursorFreeCapture, stopCursorFreeCapture, stopAllCursorFreeCaptures } from "../cursorFreeCaptureService";
import type { WebContents } from "electron";

describe("cursor-free capture", () => {
  let child: EventEmitter & { stdout: PassThrough; stderr: PassThrough; kill: ReturnType<typeof vi.fn> };
  let owner: WebContents;
  beforeEach(() => {
    vi.stubGlobal("process", { ...process, platform: "win32" });
    vi.clearAllMocks();
    child = Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough(), kill: vi.fn() });
    mocks.spawn.mockReturnValue(child);
    owner = Object.assign(new EventEmitter(), { id: 7, isDestroyed: () => false, send: vi.fn() }) as unknown as WebContents;
    mocks.getSources.mockResolvedValue([{ id: "screen:0:0", display_id: "10" }, { id: "window:42:0", name: "Slides" }]);
    mocks.getAllDisplays.mockReturnValue([{ id: 10, bounds: { x: -1280, y: 0, width: 1280, height: 720 } }]);
    mocks.dipToScreenRect.mockReturnValue({ x: -1920, y: 0, width: 1920, height: 1080 });
  });
  afterEach(() => { stopAllCursorFreeCaptures(); vi.unstubAllGlobals(); });

  it("excludes the pointer at capture and uses physical monitor coordinates", async () => {
    await startCursorFreeCapture(owner, "screen:0:0");
    const args = mocks.spawn.mock.calls[0][1];
    expect(args).toEqual(expect.arrayContaining(["-draw_mouse", "0", "-offset_x", "-1920", "-video_size", "1920x1080"]));
    expect(mocks.spawn.mock.calls[0][2]).toEqual({ windowsHide: true });
  });
  it("captures a uniquely named external window with the pointer excluded", async () => {
    await startCursorFreeCapture(owner, "window:42:0");
    expect(mocks.spawn.mock.calls[0][1]).toEqual(expect.arrayContaining(["-draw_mouse", "0", "title=Slides"]));
  });
  it("rejects stale source ids without starting a capture", async () => {
    await expect(startCursorFreeCapture(owner, "window:99:0")).rejects.toThrow("unavailable");
    expect(mocks.spawn).not.toHaveBeenCalled();
  });
  it("assembles split JPEG frames and restricts stopping to the owning renderer", async () => {
    const id = await startCursorFreeCapture(owner, "screen:0:0");
    child.stdout.write(Buffer.from([0xff, 0xd8, 1, 0xff]));
    expect(owner.send).not.toHaveBeenCalled();
    child.stdout.write(Buffer.from([0xd9]));
    expect(owner.send).toHaveBeenCalledWith(expect.any(String), { id, dataUrl: "data:image/jpeg;base64,/9gB/9k=" });
    stopCursorFreeCapture(id!, 8);
    expect(child.kill).not.toHaveBeenCalled();
    stopCursorFreeCapture(id!, 7);
    expect(child.kill).toHaveBeenCalledOnce();
  });
  it("stops native capture when its renderer closes", async () => {
    await startCursorFreeCapture(owner, "screen:0:0");
    owner.emit("destroyed");
    expect(child.kill).toHaveBeenCalledOnce();
  });
});

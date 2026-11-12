import fs from "fs/promises";
import os from "os";
import path from "path";
import { afterEach, describe, expect, it } from "vitest";
import { RecordingDiskSession } from "../recordingDiskSession";

const testDirectories: string[] = [];

const createTestPath = async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "openchurch-recording-test-"));
  testDirectories.push(directory);
  return path.join(directory, "session.webm");
};

afterEach(async () => {
  await Promise.all(testDirectories.splice(0).map((directory) => fs.rm(directory, { recursive: true, force: true })));
});

describe("RecordingDiskSession", () => {
  it("writes each chunk to disk before the recording is sealed", async () => {
    const filePath = await createTestPath();
    const session = await RecordingDiskSession.create(filePath);

    await session.append(Buffer.from("first chunk"));

    expect(await fs.readFile(filePath, "utf8")).toBe("first chunk");
    expect(session.bytesWritten).toBe(11);
    await session.seal();
  });

  it("preserves chunk order when multiple writes are queued", async () => {
    const filePath = await createTestPath();
    const session = await RecordingDiskSession.create(filePath);

    await Promise.all([
      session.append(Buffer.from("one-")),
      session.append(Buffer.from("two-")),
      session.append(Buffer.from("three"))
    ]);
    expect(await session.seal()).toBe(13);
    expect(await fs.readFile(filePath, "utf8")).toBe("one-two-three");
  });

  it("removes an incomplete temporary recording when cancelled", async () => {
    const filePath = await createTestPath();
    const session = await RecordingDiskSession.create(filePath);
    await session.append(Buffer.from("incomplete"));

    await session.cancel();

    await expect(fs.access(filePath)).rejects.toThrow();
    await expect(session.append(Buffer.from("late"))).rejects.toThrow("no longer active");
  });

  it("uses exclusive creation so an existing recording is never overwritten", async () => {
    const filePath = await createTestPath();
    await fs.writeFile(filePath, "keep me");

    await expect(RecordingDiskSession.create(filePath)).rejects.toThrow();
    expect(await fs.readFile(filePath, "utf8")).toBe("keep me");
  });
});

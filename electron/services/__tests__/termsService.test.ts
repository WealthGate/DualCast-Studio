import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdtemp, readFile, rmdir, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const fixture = vi.hoisted(() => ({ profile: "", version: "0.6.50", packaged: true, prompt: vi.fn() }));

vi.mock("electron", () => ({
  app: {
    get isPackaged() { return fixture.packaged; },
    getPath: () => fixture.profile,
    getVersion: () => fixture.version,
    getAppPath: () => process.cwd()
  },
  dialog: { showMessageBox: fixture.prompt, showErrorBox: vi.fn() }
}));

import { requireTermsAcceptance } from "../termsService";

describe("desktop terms acceptance", () => {
  beforeEach(async () => {
    fixture.profile = await mkdtemp(join(tmpdir(), "openchurch-test-terms-"));
    fixture.version = "0.6.50";
    fixture.packaged = true;
    fixture.prompt.mockReset();
  });

  afterEach(async () => {
    await unlink(join(fixture.profile, "terms-accepted-version")).catch(() => undefined);
    await rmdir(fixture.profile);
  });

  it("requires explicit acceptance on the first start and after a version change", async () => {
    fixture.prompt.mockResolvedValueOnce({ response: 1 }).mockResolvedValueOnce({ response: 0 });
    expect(await requireTermsAcceptance()).toBe(true);
    expect(fixture.prompt).toHaveBeenCalledWith(expect.objectContaining({ detail: expect.stringContaining("By accepting"), defaultId: 0, cancelId: 0 }));
    expect(await readFile(join(fixture.profile, "terms-accepted-version"), "utf8")).toBe("0.6.50");
    expect(await requireTermsAcceptance()).toBe(true);
    expect(fixture.prompt).toHaveBeenCalledTimes(1);
    fixture.version = "0.6.51";
    expect(await requireTermsAcceptance()).toBe(false);
    expect(await readFile(join(fixture.profile, "terms-accepted-version"), "utf8")).toBe("0.6.50");
  });

  it("recognizes an acceptance saved by the installer for the matching version", async () => {
    await writeFile(join(fixture.profile, "terms-accepted-version"), fixture.version, "utf8");
    expect(await requireTermsAcceptance()).toBe(true);
    expect(fixture.prompt).not.toHaveBeenCalled();
  });
});

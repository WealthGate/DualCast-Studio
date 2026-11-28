import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  openExternal: vi.fn(), getStoredProviderToken: vi.fn(), setStoredProviderToken: vi.fn(),
  clearStoredProviderToken: vi.fn(), resolveStreamingCredentials: vi.fn()
}));
vi.mock("electron", () => ({ shell: { openExternal: mocks.openExternal } }));
vi.mock("../streamingCredentialService", () => mocks);
import { authorizeStreaming, hasYouTubeWritePermission, getYouTubeBroadcastStatus, openYouTubeBroadcast } from "../streamingAuthService";
import { normalizeYouTubeBroadcastSettings } from "../../../src/shared/streamingPlatforms";

const scope = "https://www.googleapis.com/auth/youtube.force-ssl";
const payload = { provider: "youtube" as const, destinationId: "test", broadcast: normalizeYouTubeBroadcastSettings({ title: "Service" }) };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe("YouTube streaming permissions", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.resolveStreamingCredentials.mockReturnValue({ clientId: "test-client" });
    mocks.getStoredProviderToken.mockReturnValue({ refreshToken: "refresh", scopes: scope });
    mocks.openExternal.mockRejectedValue(new Error("Reconnect opened"));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("accepts write scopes and rejects missing or read-only grants", () => {
    expect(hasYouTubeWritePermission(scope)).toBe(true);
    expect(hasYouTubeWritePermission("https://www.googleapis.com/auth/youtube")).toBe(true);
    expect(hasYouTubeWritePermission("openid email https://www.googleapis.com/auth/youtube.readonly")).toBe(false);
    expect(hasYouTubeWritePermission()).toBe(false);
  });

  it("reconnects legacy saved sign-ins before creating any broadcast", async () => {
    mocks.getStoredProviderToken.mockReturnValue({ refreshToken: "legacy" });
    const request = vi.fn();
    vi.stubGlobal("fetch", request);
    await authorizeStreaming(payload);
    expect(request).not.toHaveBeenCalled();
    const url = new URL(mocks.openExternal.mock.calls[0][0]);
    expect(url.searchParams.get("scope")).toContain(scope);
    expect(url.searchParams.get("prompt")).toContain("consent");
  });

  it("automatically reconnects once after a broadcast permission rejection", async () => {
    const request = vi.fn()
      .mockResolvedValueOnce(json({ access_token: "access" }))
      .mockResolvedValueOnce(json({ email: "owner@example.com" }))
      .mockResolvedValueOnce(json({ error: { message: "Insufficient Permission", errors: [{ reason: "insufficientPermissions" }] } }, 403));
    vi.stubGlobal("fetch", request);
    await authorizeStreaming(payload);
    expect(mocks.clearStoredProviderToken).toHaveBeenCalledWith("youtube");
    expect(mocks.openExternal).toHaveBeenCalledOnce();
    expect(request).toHaveBeenCalledTimes(3);
  });

  it("explains channel activation without repeating sign-in", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json({ access_token: "access" }))
      .mockResolvedValueOnce(json({ email: "owner@example.com" }))
      .mockResolvedValueOnce(json({ error: { errors: [{ reason: "liveStreamingNotEnabled" }] } }, 403)));
    const result = await authorizeStreaming(payload);
    expect(result.ok).toBe(false);
    expect(result.message).toContain("Enable live streaming");
    expect(mocks.openExternal).not.toHaveBeenCalled();
  });

  it("creates and binds a broadcast and automatically returns the stream endpoint", async () => {
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json({ access_token: "access", scope }))
      .mockResolvedValueOnce(json({ email: "owner@example.com" }))
      .mockResolvedValueOnce(json({ id: "broadcast" }))
      .mockResolvedValueOnce(json({ id: "stream", cdn: { ingestionInfo: { rtmpsIngestionAddress: "rtmps://example.test/live", streamName: "key" } } }))
      .mockResolvedValueOnce(json({ id: "broadcast" })));
    expect(await authorizeStreaming(payload)).toMatchObject({ ok: true, broadcastId: "broadcast", rtmpUrl: "rtmps://example.test/live", streamKey: "key" });
    expect(mocks.openExternal).not.toHaveBeenCalled();
  });
  it("distinguishes incoming video from a published broadcast and explains unlisted visibility", async () => {
    mocks.getStoredProviderToken.mockReturnValue({ accessToken: "access", expiresAt: Date.now()+60000 });
    vi.stubGlobal("fetch", vi.fn()
      .mockResolvedValueOnce(json({ items: [{ status: { lifeCycleStatus: "ready", privacyStatus: "unlisted" }, contentDetails: { boundStreamId: "stream", enableAutoStart: false } }] }))
      .mockResolvedValueOnce(json({ items: [{ status: { streamStatus: "active" } }] })));
    const result = await getYouTubeBroadcastStatus("broadcast");
    expect(result).toMatchObject({ ok: true, lifeCycleStatus: "ready", streamStatus: "active", privacyStatus: "unlisted" });
    expect(result.message).toContain("Click Go Live"); expect(result.message).toContain("viewers need the broadcast link");
    expect(mocks.openExternal).not.toHaveBeenCalled();
  });
  it("does not claim a broadcast is live or open sign-in when status cannot be checked", async () => {
    mocks.getStoredProviderToken.mockReturnValue(null);
    expect(await getYouTubeBroadcastStatus("broadcast")).toMatchObject({ ok: false });
    expect(mocks.openExternal).not.toHaveBeenCalled();
    await expect(openYouTubeBroadcast("https://invalid.test")).rejects.toThrow("Invalid");
  });
  it("reports completed broadcasts rather than treating encoder output as live", async () => {
    mocks.getStoredProviderToken.mockReturnValue({ accessToken: "access", expiresAt: Date.now()+60000 });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ items: [{ status: { lifeCycleStatus: "complete", privacyStatus: "public" } }] })));
    expect((await getYouTubeBroadcastStatus("broadcast")).message).toContain("has ended");
  });
});

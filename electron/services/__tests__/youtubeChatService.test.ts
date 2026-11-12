import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const token = vi.hoisted(() => vi.fn());
vi.mock("../streamingAuthService", () => ({ getYouTubeSessionToken: token }));
import { readYouTubeChat, sendYouTubeChat } from "../youtubeChatService";
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
describe("YouTube live chat", () => {
  beforeEach(() => { token.mockReset().mockResolvedValue("test-access"); });
  afterEach(() => vi.unstubAllGlobals());
  it("reads plain messages, paginates and respects YouTube's minimum polling interval", async () => {
    const request = vi.fn().mockResolvedValue(json({ nextPageToken: "next", pollingIntervalMillis: 15000, items: [{ id: "1", authorDetails: { displayName: "Viewer" }, snippet: { displayMessage: "Hello <everyone>" } }] }));
    vi.stubGlobal("fetch", request);
    expect(await readYouTubeChat("chat", "page")).toMatchObject({ ok: true, nextPageToken: "next", pollingIntervalMillis: 15000, messages: [{ id: "1", author: "Viewer", text: "Hello <everyone>" }] });
    expect(new URL(request.mock.calls[0][0]).searchParams.get("pageToken")).toBe("page");
  });
  it("posts exactly the operator's message without retrying", async () => {
    const request = vi.fn().mockResolvedValue(json({ id: "sent" })); vi.stubGlobal("fetch", request);
    expect(await sendYouTubeChat("chat", " Welcome! ")).toEqual({ ok: true });
    expect(request).toHaveBeenCalledOnce();
    expect(JSON.parse(request.mock.calls[0][1].body).snippet).toEqual({ liveChatId: "chat", type: "textMessageEvent", textMessageDetails: { messageText: "Welcome!" } });
  });
  it("rejects empty or oversized messages before any network request", async () => {
    const request = vi.fn(); vi.stubGlobal("fetch", request);
    expect((await sendYouTubeChat("chat", " ")).ok).toBe(false);
    expect((await sendYouTubeChat("chat", "a".repeat(201))).ok).toBe(false);
    expect(request).not.toHaveBeenCalled();
  });
  it("explains disabled or ended chat without pretending the send succeeded", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ error: { errors: [{ reason: "liveChatEnded" }] } }, 403)));
    expect(await sendYouTubeChat("chat", "Hello")).toMatchObject({ ok: false, message: "This live chat has ended." });
  });
});

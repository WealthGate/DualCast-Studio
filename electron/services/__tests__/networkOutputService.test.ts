import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import http from "http";
import type { AddressInfo } from "net";
import path from "path";
import { createNetworkOutputServer, setRemoteCommandPublisher, startNetworkOutput, updateNetworkProgramFrame, updateRemoteControlState } from "../networkOutputService";
import type { RemoteControlState } from "../../../src/shared/remoteControl";

const state: RemoteControlState = {
  stationName: "Test studio", scenes: [{ id: "camera-a", name: "Camera A", cameras: ["Wide"], enabled: true }],
  previewSceneId: "camera-a", programSceneId: "camera-a", isBlack: false, isFrozen: false, isRecording: false,
  recordingSeconds: 0, streamStatus: "idle", textMode: "show", lowerThirdHidden: false, hasLogo: false,
  masterGain: 1, slides: [], activeSlideId: null, programSlideId: null, scriptureSource: "online", tickers: []
};
let server: http.Server, base: string;
const publisher = vi.fn(async () => ({ ok: true, message: "Applied in studio" }));
const post = (route: string, body: unknown, cookie = "", extras: Record<string, string> = {}) => fetch(base + route, {
  method: "POST", headers: { "Content-Type": "application/json", "X-OpenChurch-Remote": "1", Cookie: cookie, ...extras }, body: JSON.stringify(body)
});
const login = async (extras: Record<string, string> = {}) => {
  const response = await post("/api/session", { pin: "58319427" }, "", extras);
  expect(response.status).toBe(200);
  return response.headers.get("set-cookie")!;
};
beforeEach(async () => {
  publisher.mockClear(); setRemoteCommandPublisher(publisher); updateRemoteControlState(state);
  server = createNetworkOutputServer({ operatorPin: "58319427", remoteUrl: "https://studio.example.ts.net", assetDirectory: path.resolve("assets/mobile") });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterEach(async () => {
  vi.restoreAllMocks(); setRemoteCommandPublisher(null); updateRemoteControlState(null);
  const closed = new Promise<void>(resolve => server.close(() => resolve())); server.closeAllConnections(); await closed;
});

describe("mobile hub HTTP boundary", () => {
  it("serves the installable shell, real icons and network-only service worker", async () => {
    const shell = await fetch(base + "/operator?pin=legacy");
    expect(shell.status).toBe(200); expect(shell.headers.get("content-security-policy")).toContain("script-src 'self'");
    expect(await shell.text()).not.toContain("58319427");
    const manifest = await fetch(base + "/manifest.webmanifest").then(response => response.json());
    expect(manifest.start_url).toBe("/operator"); expect(manifest.icons).toHaveLength(2);
    const icon = await fetch(base + manifest.icons[0].src);
    expect(icon.headers.get("content-type")).toBe("image/png"); expect((await icon.arrayBuffer()).byteLength).toBeGreaterThan(1000);
    expect(await fetch(base + "/sw.js").then(response => response.text())).toContain('event.request.method !== "GET"');
  });
  it("protects state, mobile picture and commands; former PIN headers do not bypass a session", async () => {
    for (const route of ["/api/state", "/api/frame"]) expect((await fetch(base + route)).status).toBe(401);
    expect((await post("/api/command", { id: "command-1", command: { action: "black", enabled: true } }, "", { "X-OpenChurch-Pin": "58319427" })).status).toBe(401);
    expect((await post("/api/session", { pin: "wrong" })).status).toBe(401);
    const cookie = await login(); expect(cookie).toContain("HttpOnly"); expect(cookie).toContain("SameSite=Strict"); expect(cookie).not.toContain("58319427");
    const response = await fetch(base + "/api/state", { headers: { Cookie: cookie.split(";")[0] } });
    expect(response.headers.get("cache-control")).toBe("no-store"); expect(await response.json()).toEqual({ online: true, state });
  });
  it("rejects cross-origin and DNS rebinding requests, and malformed commands", async () => {
    const cookie = (await login()).split(";")[0];
    expect((await post("/api/command", { id: "command-1", command: { action: "black", enabled: true } }, cookie, { Origin: "https://attacker.example" })).status).toBe(403);
    const hostileStatus = await new Promise<number | undefined>((resolve, reject) => {
      http.get(base + "/api/state", { headers: { Host: "attacker.example", Cookie: cookie } }, response => { response.resume(); resolve(response.statusCode); }).on("error", reject);
    });
    expect(hostileStatus).toBe(403);
    expect((await post("/api/command", { id: "command-1", command: { action: "master-gain", gain: 900 } }, cookie)).status).toBe(400);
    expect((await fetch(base + "/api/command", { method: "POST", headers: { Cookie: cookie }, body: "{}" })).status).toBe(403);
    expect(publisher).not.toHaveBeenCalled();
  });
  it("supports a configured HTTPS proxy even when the proxy rewrites Host", async () => {
    const cookie = await login({ Origin: "https://studio.example.ts.net" }); expect(cookie).toContain("Secure");
    const response = await post("/api/command", { id: "command-https", command: { action: "black", enabled: true } }, cookie.split(";")[0], { Origin: "https://studio.example.ts.net" });
    expect(response.status).toBe(200); expect((await response.json()).ok).toBe(true);
  });
  it("acknowledges execution and executes the same command ID once", async () => {
    const cookie = (await login()).split(";")[0], body = { id: "same-command", command: { action: "take", transition: "cut" } };
    const responses = await Promise.all([post("/api/command", body, cookie), post("/api/command", body, cookie)]);
    for (const response of responses) expect(await response.json()).toEqual({ ok: true, message: "Applied in studio" });
    expect(publisher).toHaveBeenCalledTimes(1);
    expect((await post("/api/command", { ...body, command: { action: "black", enabled: true } }, cookie)).status).toBe(409);
  });
  it("does not queue offline or stale commands", async () => {
    const cookie = (await login()).split(";")[0];
    vi.spyOn(Date, "now").mockReturnValue(Date.now() + 6000);
    const response = await post("/api/command", { id: "offline-command", command: { action: "black", enabled: true } }, cookie);
    expect(response.status).toBe(503); expect(publisher).not.toHaveBeenCalled();
    expect(await fetch(base + "/api/state", { headers: { Cookie: cookie } }).then(response => response.json())).toMatchObject({ online: false });
  });
  it("revokes the session when the phone is locked", async () => {
    const cookie = (await login()).split(";")[0];
    expect((await post("/api/logout", {}, cookie)).status).toBe(200);
    expect((await fetch(base + "/api/state", { headers: { Cookie: cookie } })).status).toBe(401);
  });
  it("limits PIN guessing", async () => {
    for (let i = 0; i < 5; i++) expect((await post("/api/session", { pin: "00000000" })).status).toBe(401);
    const response = await post("/api/session", { pin: "58319427" }); expect(response.status).toBe(429); expect(response.headers.get("retry-after")).toBe("60");
  });
  it("preserves LAN Program output independently of mobile sign-in", async () => {
    updateNetworkProgramFrame("data:image/webp;base64,dGVzdA==");
    expect((await fetch(base + "/program")).status).toBe(200);
    const response = await fetch(base + "/program.jpg"); expect(response.headers.get("content-type")).toBe("image/webp"); expect(await response.text()).toBe("test");
    expect((await fetch(base + "/api/frame")).status).toBe(401);
  });
  it("rejects the former default PIN and invalid public addresses before binding", async () => {
    await expect(startNetworkOutput({ operatorPin: "2468" })).rejects.toThrow("6–16");
    await expect(startNetworkOutput({ operatorPin: "58319427", remoteUrl: "http://public.example" })).rejects.toThrow("HTTPS");
  });
});

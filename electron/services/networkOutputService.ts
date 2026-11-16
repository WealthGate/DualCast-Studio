import http from "http";
import os from "os";
import path from "path";
import fs from "fs/promises";
import { randomBytes, timingSafeEqual } from "crypto";
import type { NetworkOutputStatus, RemoteOperatorAction } from "../../src/shared/types";
import { isRemoteCommand, normalizeRemoteUrl } from "../../src/shared/remoteControl";
import type { RemoteCommand, RemoteCommandResult, RemoteControlState } from "../../src/shared/remoteControl";

let server: http.Server | null = null;
let currentPort = 8787, operatorPin = "", remoteUrl = "";
let latestFrame: Buffer | null = null, latestFrameMime = "image/webp", frameUpdatedAt = 0;
let remoteState: RemoteControlState | null = null, stateUpdatedAt = 0;
let remoteActionPublisher: ((action: RemoteOperatorAction) => void) | null = null;
let remoteCommandPublisher: ((command: RemoteCommand) => Promise<RemoteCommandResult>) | null = null;
const online = () => Boolean(remoteState && remoteCommandPublisher && Date.now() - stateUpdatedAt < 5000);

const getLanAddresses = () => {
  const addresses = new Set<string>(["127.0.0.1"]);
  Object.values(os.networkInterfaces()).forEach(entries => entries?.forEach(entry => {
    if (entry.family === "IPv4" && !entry.internal) addresses.add(entry.address);
  }));
  return Array.from(addresses);
};
const getStatus = (): NetworkOutputStatus => ({
  running: Boolean(server), port: currentPort,
  programUrls: getLanAddresses().map(address => `http://${address}:${currentPort}/program`),
  operatorUrls: [...(remoteUrl ? [`${remoteUrl}/operator`] : []), ...getLanAddresses().map(address => `http://${address}:${currentPort}/operator`)]
});
const programPage = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>OpenChurch Program</title><style>html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000;cursor:none}body *{cursor:none!important}img{width:100%;height:100%;object-fit:contain;background:#000}</style></head><body><img id="program" alt="OpenChurch Program"><script>
const image=document.getElementById("program");
const refresh=()=>{const started=performance.now();const next=new Image();const schedule=()=>setTimeout(refresh,Math.max(0,1000/30-(performance.now()-started)));next.onload=()=>{image.src=next.src;schedule()};next.onerror=()=>setTimeout(refresh,250);next.src="/program.jpg?t="+Date.now()};refresh();
</script></body></html>`;
const json = (response: http.ServerResponse, status: number, data: unknown) => {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(data));
};
const readJsonBody = (request: http.IncomingMessage) => new Promise<Record<string, unknown> | null>(resolve => {
  const chunks: Buffer[] = [];
  let size = 0, settled = false;
  const finish = (result: Record<string, unknown> | null) => { if (!settled) { settled = true; resolve(result); } };
  const timeout = setTimeout(() => { finish(null); request.destroy(); }, 5000);
  const done = (result: Record<string, unknown> | null) => { clearTimeout(timeout); finish(result); };
  request.on("data", (chunk: Buffer) => {
    size += chunk.length;
    if (size > 65_536) { done(null); request.destroy(); } else chunks.push(chunk);
  });
  request.on("end", () => {
    try { const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8")); done(parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null); }
    catch { done(null); }
  });
  request.on("error", () => done(null));
  request.on("aborted", () => done(null));
});
type HubOptions = { operatorPin: string; remoteUrl?: string; assetDirectory?: string };
type Session = { expiresAt: number; commands: Map<string, { fingerprint: string; result: Promise<RemoteCommandResult> }> };

// Tests exercise real HTTP and cookies without launching Electron.
export const createNetworkOutputServer = (options: HubOptions) => {
  const externalOrigin = normalizeRemoteUrl(options.remoteUrl);
  const assets = options.assetDirectory ?? path.resolve(__dirname, "../assets/mobile");
  const sessions = new Map<string, Session>();
  const attempts = new Map<string, { count: number; resetAt: number }>();
  let commandBusy = false;
  const pinBytes = Buffer.from(options.operatorPin);
  const routes: Record<string, [string, string]> = {
    "/operator": ["index.html", "text/html; charset=utf-8"],
    "/mobile/app.js": ["app.js", "text/javascript; charset=utf-8"],
    "/mobile/app.css": ["app.css", "text/css; charset=utf-8"],
    "/mobile/icon-192.png": ["icon-192.png", "image/png"],
    "/mobile/icon-512.png": ["icon-512.png", "image/png"],
    "/sw.js": ["sw.js", "text/javascript; charset=utf-8"]
  };
  const candidate = http.createServer((request, response) => {
    void (async () => {
      response.setHeader("X-Content-Type-Options", "nosniff");
      response.setHeader("Referrer-Policy", "no-referrer");
      response.setHeader("X-Frame-Options", "DENY");
      response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
      response.setHeader("Cache-Control", "no-store");
      const host = request.headers.host ?? "";
      const localHosts = getLanAddresses().map(address => `${address}:${request.socket.localPort}`);
      localHosts.push(`localhost:${request.socket.localPort}`);
      if (!localHosts.includes(host) && (!externalOrigin || host !== new URL(externalOrigin).host)) {
        json(response, 403, { message: "Unrecognized studio address. Configure the HTTPS remote address in Venue." }); return;
      }
      const url = new URL(request.url ?? "/", `http://${host}`);
      const isApi = url.pathname.startsWith("/api/");
      if (isApi) {
        const origin = request.headers.origin;
        if (origin && origin !== `http://${host}` && origin !== `https://${host}` && origin !== externalOrigin) { json(response, 403, { message: "Cross-origin control is not allowed." }); return; }
        if (request.method === "POST" && (request.headers["x-openchurch-remote"] !== "1" || !request.headers["content-type"]?.startsWith("application/json"))) {
          json(response, 403, { message: "Use the OpenChurch mobile control app." }); return;
        }
      }
      if ((url.pathname === "/" || url.pathname === "/program") && request.method === "GET") {
        response.writeHead(200, { "Content-Type": "text/html; charset=utf-8" }); response.end(programPage); return;
      }
      if (url.pathname === "/program.jpg" && request.method === "GET") {
        if (!latestFrame) { response.writeHead(204); response.end(); return; }
        response.writeHead(200, { "Content-Type": latestFrameMime, "Content-Length": latestFrame.length }); response.end(latestFrame); return;
      }
      if (routes[url.pathname] && request.method === "GET") {
        response.setHeader("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
        const [file, mime] = routes[url.pathname];
        const data = await fs.readFile(path.join(assets, file));
        response.setHeader("Content-Type", mime); response.end(data); return;
      }
      if (url.pathname === "/manifest.webmanifest" && request.method === "GET") {
        response.setHeader("Content-Type", "application/manifest+json");
        response.end(JSON.stringify({ id: "/operator", name: "OpenChurch Broadcast Remote", short_name: "OpenChurch", start_url: "/operator", scope: "/", display: "standalone", background_color: "#0b111b", theme_color: "#0b111b", icons: [192, 512].map(size => ({ src: `/mobile/icon-${size}.png`, sizes: `${size}x${size}`, type: "image/png", purpose: "any" })) })); return;
      }
      if (url.pathname === "/api/session" && request.method === "POST") {
        const address = request.socket.remoteAddress ?? "unknown", now = Date.now();
        for (const [key, item] of attempts) if (item.resetAt <= now) attempts.delete(key);
        for (const [key, item] of sessions) if (item.expiresAt <= now) sessions.delete(key);
        const entry = attempts.get(address) ?? { count: 0, resetAt: now + 60_000 };
        if (entry.count >= 5 || attempts.size >= 1024) { response.setHeader("Retry-After", "60"); json(response, 429, { message: "Too many PIN attempts. Wait one minute and try again." }); return; }
        entry.count++; attempts.set(address, entry);
        const body = await readJsonBody(request);
        const supplied = Buffer.from(typeof body?.pin === "string" ? body.pin : "");
        if (supplied.length !== pinBytes.length || !timingSafeEqual(supplied, pinBytes)) { json(response, 401, { message: "Incorrect operator PIN." }); return; }
        if (sessions.size >= 64) { json(response, 429, { message: "Too many remote sessions. Restart the hub to revoke sessions." }); return; }
        const token = randomBytes(32).toString("hex");
        sessions.set(token, { expiresAt: now + 8 * 60 * 60_000, commands: new Map() });
        const secure = externalOrigin && (host === new URL(externalOrigin).host || request.headers.origin === externalOrigin) ? "; Secure" : "";
        response.setHeader("Set-Cookie", `openchurch-remote=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800${secure}`);
        json(response, 200, { ok: true }); return;
      }
      if (isApi) {
        const token = request.headers.cookie?.match(/(?:^|;\s*)openchurch-remote=([a-f0-9]{64})(?:;|$)/)?.[1] ?? "";
        const session = sessions.get(token);
        if (!session || session.expiresAt <= Date.now()) { sessions.delete(token); json(response, 401, { message: "Unlock the remote with the studio PIN." }); return; }
        if (url.pathname === "/api/logout" && request.method === "POST") {
          sessions.delete(token); response.setHeader("Set-Cookie", "openchurch-remote=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"); json(response, 200, { ok: true }); return;
        }
        if (url.pathname === "/api/state" && request.method === "GET") { json(response, 200, { online: online(), state: remoteState }); return; }
        if (url.pathname === "/api/frame" && request.method === "GET") {
          if (!online() || !latestFrame || Date.now() - frameUpdatedAt > 5000) { response.writeHead(204); response.end(); return; }
          response.writeHead(200, { "Content-Type": latestFrameMime, "Content-Length": latestFrame.length }); response.end(latestFrame); return;
        }
        if (url.pathname === "/api/command" && request.method === "POST") {
          const body = await readJsonBody(request);
          if (!body || typeof body.id !== "string" || !/^[a-zA-Z0-9-]{8,100}$/.test(body.id) || !isRemoteCommand(body.command)) {
            json(response, 400, { ok: false, message: "Invalid control command." }); return;
          }
          const fingerprint = JSON.stringify(body.command), existing = session.commands.get(body.id);
          if (existing) {
            if (existing.fingerprint !== fingerprint) { json(response, 409, { ok: false, message: "Command ID already used." }); return; }
            json(response, 200, await existing.result); return;
          }
          if (!online() || !remoteCommandPublisher) { json(response, 503, { ok: false, message: "Studio disconnected. Commands are not queued." }); return; }
          if (commandBusy) { json(response, 409, { ok: false, message: "The studio is processing another remote command. Check live status, then try again." }); return; }
          commandBusy = true;
          const execute = async () => {
            try { return await remoteCommandPublisher!(body.command as RemoteCommand); }
            catch (error) { return { ok: false, message: error instanceof Error ? error.message : "Studio command failed." }; }
            finally { commandBusy = false; }
          };
          // Cache the in-flight promise so a duplicate request cannot perform a
          // second TAKE or advance two slides. Retain IDs for the whole session.
          const result = execute(); session.commands.set(body.id, { fingerprint, result });
          if (session.commands.size > 10_000) sessions.delete(token);
          json(response, 200, await result); return;
        }
        if (url.pathname === "/api/action" && request.method === "POST") {
          const body = await readJsonBody(request);
          if (!online()) { json(response, 503, { message: "Studio disconnected." }); return; }
          if (!["take", "toggle-record", "cut-black", "toggle-freeze"].includes(String(body?.action))) { json(response, 400, { message: "Invalid action." }); return; }
          remoteActionPublisher?.(body!.action as RemoteOperatorAction); json(response, 202, { message: "Command sent." }); return;
        }
      }
      json(response, 404, { message: "Not found." });
    })().catch(() => { if (!response.headersSent) json(response, 500, { message: "Mobile control could not serve this request." }); else response.end(); });
  });
  candidate.requestTimeout = 15_000; candidate.headersTimeout = 10_000;
  return candidate;
};
export const setRemoteActionPublisher = (publisher: (action: RemoteOperatorAction) => void) => { remoteActionPublisher = publisher; };
export const setRemoteCommandPublisher = (publisher: ((command: RemoteCommand) => Promise<RemoteCommandResult>) | null) => { remoteCommandPublisher = publisher; };
export const updateRemoteControlState = (state: RemoteControlState | null) => { remoteState = state; stateUpdatedAt = Date.now(); };
export const updateNetworkProgramFrame = (dataUrl: string) => {
  const match = dataUrl.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/);
  if (match) { latestFrameMime = match[1] === "image/jpg" ? "image/jpeg" : match[1]; latestFrame = Buffer.from(match[2], "base64"); frameUpdatedAt = Date.now(); }
};
export const startNetworkOutput = async (payload?: { port?: number; operatorPin?: string; remoteUrl?: string }) => {
  const requestedPort = Math.round(Math.max(1024, Math.min(65535, Number(payload?.port) || 8787)));
  const requestedPin = String(payload?.operatorPin ?? "");
  if (!/^\d{6,16}$/.test(requestedPin)) throw new Error("Set an operator PIN of 6–16 digits before starting Mobile Control.");
  const requestedRemoteUrl = normalizeRemoteUrl(payload?.remoteUrl);
  if (payload?.remoteUrl?.trim() && !requestedRemoteUrl) throw new Error("Enter an HTTPS remote address without a path, query, or password.");
  if (server && currentPort === requestedPort && operatorPin === requestedPin && remoteUrl === requestedRemoteUrl) return getStatus();
  await stopNetworkOutput(); currentPort = requestedPort; operatorPin = requestedPin; remoteUrl = requestedRemoteUrl;
  const candidate = createNetworkOutputServer({ operatorPin, remoteUrl });
  await new Promise<void>((resolve, reject) => {
    const handleError = (error: Error) => reject(error); candidate.once("error", handleError);
    candidate.listen(currentPort, "0.0.0.0", () => { candidate.off("error", handleError); resolve(); });
  });
  server = candidate; candidate.on("error", () => { if (server === candidate) server = null; }); return getStatus();
};
export const stopNetworkOutput = async () => {
  if (!server) return getStatus();
  const activeServer = server; server = null;
  const closed = new Promise<void>(resolve => activeServer.close(() => resolve())); activeServer.closeAllConnections(); await closed;
  latestFrame = null; frameUpdatedAt = 0; return getStatus();
};
export const getNetworkOutputStatus = () => getStatus();

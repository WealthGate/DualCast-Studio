import http from "http";
import os from "os";
import { NetworkOutputStatus, RemoteOperatorAction } from "../../src/shared/types";

type RemoteActionPublisher = (action: RemoteOperatorAction) => void;

let server: http.Server | null = null;
let currentPort = 8787;
let operatorPin = "2468";
let latestFrame: Buffer | null = null;
let latestFrameMime = "image/webp";
let remoteActionPublisher: RemoteActionPublisher | null = null;

const getLanAddresses = () => {
  const addresses = new Set<string>(["127.0.0.1"]);
  const interfaces = os.networkInterfaces();
  Object.values(interfaces).forEach((entries) => {
    entries?.forEach((entry) => {
      if (entry.family === "IPv4" && !entry.internal) {
        addresses.add(entry.address);
      }
    });
  });
  return Array.from(addresses);
};

const getStatus = (): NetworkOutputStatus => {
  const addresses = getLanAddresses();
  return {
    running: Boolean(server),
    port: currentPort,
    programUrls: addresses.map((address) => `http://${address}:${currentPort}/program`),
    operatorUrls: addresses.map(
      (address) => `http://${address}:${currentPort}/operator?pin=${encodeURIComponent(operatorPin)}`
    )
  };
};

const sendHtml = (response: http.ServerResponse, html: string) => {
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(html);
};

const programPage = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>DualCast Program</title>
    <style>
      html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000}
      img{width:100%;height:100%;object-fit:contain;background:#000}
    </style>
  </head>
  <body>
    <img id="program" alt="DualCast Program" />
    <script>
      const image = document.getElementById("program");
      const refresh = () => {
        const next = new Image();
        next.onload = () => { image.src = next.src; };
        next.src = "/program.jpg?t=" + Date.now();
      };
      refresh();
      setInterval(refresh, 100);
    </script>
  </body>
</html>`;

const operatorPage = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>DualCast Remote Operator</title>
    <style>
      :root{color-scheme:dark;font-family:system-ui,sans-serif}
      body{margin:0;background:#081018;color:#f8fafc;padding:24px}
      main{max-width:680px;margin:auto}
      h1{font-size:24px;margin:0 0 8px}
      p{color:#cbd5e1;margin:0 0 24px}
      .grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}
      button{min-height:82px;border:2px solid #38bdf8;border-radius:14px;background:#102334;color:#fff;font-size:18px;font-weight:700}
      button.danger{border-color:#fb7185;background:#3b111b}
      #status{margin-top:18px;color:#7dd3fc;min-height:24px}
    </style>
  </head>
  <body>
    <main>
      <h1>DualCast Remote Operator</h1>
      <p>Large-congregation quick controls</p>
      <div class="grid">
        <button data-action="take">TAKE</button>
        <button data-action="toggle-freeze">FREEZE</button>
        <button class="danger" data-action="cut-black">CUT / RESTORE BLACK</button>
        <button class="danger" data-action="toggle-record">START / STOP RECORDING</button>
      </div>
      <div id="status"></div>
    </main>
    <script>
      const pin = new URLSearchParams(location.search).get("pin") || "";
      const status = document.getElementById("status");
      document.querySelectorAll("button").forEach((button) => {
        button.addEventListener("click", async () => {
          const response = await fetch("/api/action", {
            method: "POST",
            headers: {"Content-Type":"application/json","X-DualCast-Pin":pin},
            body: JSON.stringify({action:button.dataset.action})
          });
          status.textContent = response.ok ? "Command sent" : "Command rejected";
        });
      });
    </script>
  </body>
</html>`;

const readJsonBody = (request: http.IncomingMessage) =>
  new Promise<Record<string, unknown>>((resolve) => {
    let body = "";
    request.on("data", (chunk) => {
      body += String(chunk);
      if (body.length > 16_384) {
        request.destroy();
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(body) as Record<string, unknown>);
      } catch {
        resolve({});
      }
    });
  });

const isRemoteAction = (value: unknown): value is RemoteOperatorAction =>
  value === "toggle-record" || value === "take" || value === "cut-black" || value === "toggle-freeze";

export const setRemoteActionPublisher = (publisher: RemoteActionPublisher) => {
  remoteActionPublisher = publisher;
};

export const updateNetworkProgramFrame = (dataUrl: string) => {
  const match = dataUrl.match(/^data:(image\/(?:jpeg|jpg|png|webp));base64,(.+)$/);
  if (match) {
    latestFrameMime = match[1] === "image/jpg" ? "image/jpeg" : match[1];
    latestFrame = Buffer.from(match[2], "base64");
  }
};

export const startNetworkOutput = async (payload?: { port?: number; operatorPin?: string }) => {
  const requestedPort = Math.max(1024, Math.min(65535, Number(payload?.port) || 8787));
  const requestedPin = String(payload?.operatorPin || "2468").slice(0, 16);

  if (server && currentPort === requestedPort && operatorPin === requestedPin) {
    return getStatus();
  }

  await stopNetworkOutput();
  currentPort = requestedPort;
  operatorPin = requestedPin;

  server = http.createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);

    if (url.pathname === "/" || url.pathname === "/program") {
      sendHtml(response, programPage);
      return;
    }

    if (url.pathname === "/operator") {
      sendHtml(response, operatorPage);
      return;
    }

    if (url.pathname === "/program.jpg") {
      if (!latestFrame) {
        response.writeHead(204, { "Cache-Control": "no-store" });
        response.end();
        return;
      }
      response.writeHead(200, {
        "Content-Type": latestFrameMime,
        "Content-Length": latestFrame.length,
        "Cache-Control": "no-store"
      });
      response.end(latestFrame);
      return;
    }

    if (url.pathname === "/api/action" && request.method === "POST") {
      if (request.headers["x-dualcast-pin"] !== operatorPin) {
        response.writeHead(403);
        response.end("Invalid PIN");
        return;
      }
      const body = await readJsonBody(request);
      if (!isRemoteAction(body.action)) {
        response.writeHead(400);
        response.end("Invalid action");
        return;
      }
      remoteActionPublisher?.(body.action);
      response.writeHead(202);
      response.end("Accepted");
      return;
    }

    response.writeHead(404);
    response.end("Not found");
  });

  await new Promise<void>((resolve, reject) => {
    server?.once("error", reject);
    server?.listen(currentPort, "0.0.0.0", () => resolve());
  });

  return getStatus();
};

export const stopNetworkOutput = async () => {
  if (!server) {
    return getStatus();
  }
  const activeServer = server;
  server = null;
  await new Promise<void>((resolve) => activeServer.close(() => resolve()));
  return getStatus();
};

export const getNetworkOutputStatus = () => getStatus();

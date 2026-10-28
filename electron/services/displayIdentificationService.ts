import { BrowserWindow, screen } from "electron";
import { listProjectionDisplays } from "./displayService";

const overlays = new Set<BrowserWindow>();
const escapeHtml = (text: string) => text.replace(/[&<>"']/g, character => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[character]!));

// Use the same ordering as the background editor and display output selector.
export async function identifyProjectionDisplays(): Promise<void> {
  for (const overlay of overlays) if (!overlay.isDestroyed()) overlay.destroy();
  const connected = screen.getAllDisplays();
  await Promise.all(listProjectionDisplays().map(async (display, index) => {
    const bounds = connected.find(item => String(item.id) === display.id)?.bounds;
    if (!bounds) return;
    const width = Math.min(440, bounds.width), height = Math.min(240, bounds.height);
    const overlay = new BrowserWindow({
      title: `OpenChurch Screen ${index + 1}`, show: false, frame: false, focusable: false,
      alwaysOnTop: true, skipTaskbar: true, resizable: false, backgroundColor: "#101722",
      x: bounds.x + Math.round((bounds.width - width) / 2), y: bounds.y + Math.round((bounds.height - height) / 2), width, height,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true }
    });
    overlays.add(overlay);
    overlay.setIgnoreMouseEvents(true);
    overlay.setAlwaysOnTop(true, "screen-saver");
    const timer = setTimeout(() => { if (!overlay.isDestroyed()) overlay.destroy(); }, 3000);
    overlay.once("closed", () => { clearTimeout(timer); overlays.delete(overlay); });
    try {
      await overlay.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'"><style>body{margin:0;padding:20px;text-align:center;background:#101722;color:white;font:18px 'Segoe UI',sans-serif}strong{display:block;font-size:76px;line-height:1.1}p{margin:8px;overflow-wrap:anywhere}small{color:#b9c8e4}</style></head><body><small>OpenChurch screen</small><strong>${index + 1}</strong><p>${escapeHtml(display.name)}</p><small>${display.isPrimary ? "Primary / operator screen" : `${display.size.width} × ${display.size.height}`}</small></body></html>`)}`);
      if (!overlay.isDestroyed()) overlay.showInactive();
    } catch (error) { if (!overlay.isDestroyed()) overlay.destroy(); throw error; }
  }));
}

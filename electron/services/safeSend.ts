import type { BrowserWindow, WebContents } from "electron";

// A BrowserWindow can still exist while its renderer is already destroyed.
// Check the recipient itself, including the small race between the check and send.
export function safeSend(contents: WebContents | null | undefined, channel: string, ...args: unknown[]): boolean {
  if (!contents || contents.isDestroyed?.()) return false;
  try { contents.send(channel, ...args); return true; }
  catch (error) {
    if (contents.isDestroyed?.() || (error instanceof Error && /Object has been destroyed|Render frame was disposed|WebContents is destroyed/i.test(error.message))) return false;
    throw error;
  }
}

export function sendToWindow(window: BrowserWindow | null | undefined, channel: string, ...args: unknown[]): boolean {
  return Boolean(window && !window.isDestroyed() && safeSend(window.webContents, channel, ...args));
}

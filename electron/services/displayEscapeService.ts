import type { BrowserWindow } from "electron";

// Handle this in the main process so focused controls cannot trap Escape.
export const registerDisplayEscape = (
  window: BrowserWindow,
  stopDisplays: () => boolean,
  getStudioWindow: () => BrowserWindow | null
) => {
  window.webContents.on("before-input-event", (event, input) => {
    if (input.type !== "keyDown" || input.key !== "Escape" || !stopDisplays()) return;
    event.preventDefault();
    const studio = getStudioWindow();
    if (studio && !studio.isDestroyed()) {
      if (studio.isMinimized()) studio.restore();
      studio.show();
      studio.focus();
    }
  });
};

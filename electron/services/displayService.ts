import { desktopCapturer, screen } from "electron";
import { DisplaySource } from "../../src/shared/types";

export const listDisplays = async (): Promise<DisplaySource[]> => {
  const displays = screen.getAllDisplays();
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true
  });

  return sources.map((source) => {
    const sourceType = source.id.startsWith("window:") ? "window" : "screen";
    const displayId = source.display_id || null;
    const display = displays.find((item) => String(item.id) === String(displayId));
    const size = display?.size ?? source.thumbnail.getSize();

    return {
      id: source.id,
      name: source.name,
      sourceType,
      displayId,
      size: {
        width: size.width,
        height: size.height
      },
      thumbnailUrl: source.thumbnail.toDataURL(),
      appIconUrl: source.appIcon?.toDataURL() ?? null
    };
  });
};

import { desktopCapturer, screen } from "electron";
import { DisplaySource, ProjectionDisplay } from "../../src/shared/types";

export const listProjectionDisplays = (): ProjectionDisplay[] => {
  const primaryId = String(screen.getPrimaryDisplay().id);
  return screen.getAllDisplays()
    .map((display, index) => ({
      id: String(display.id),
      name: display.label?.trim() || (String(display.id) === primaryId ? "Primary display" : `Display ${index + 1}`),
      isPrimary: String(display.id) === primaryId,
      size: {
        width: display.size.width,
        height: display.size.height
      }
    }))
    .sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary) || left.name.localeCompare(right.name));
};

export const listDisplays = async (): Promise<DisplaySource[]> => {
  const displays = screen.getAllDisplays();
  const sources = await desktopCapturer.getSources({
    types: ["screen", "window"],
    thumbnailSize: { width: 320, height: 180 },
    fetchWindowIcons: true
  });

  return sources.map((source, index) => {
    const sourceType: DisplaySource["sourceType"] = source.id.startsWith("window:") ? "window" : "screen";
    const displayId = source.display_id || null;
    const display = displays.find((item) => String(item.id) === String(displayId));
    const size = display?.size ?? source.thumbnail.getSize();

    return {
      id: source.id,
      name: source.name?.trim() || `${sourceType === "window" ? "Open Window" : "Display"} ${index + 1}`,
      sourceType,
      displayId,
      size: {
        width: size.width,
        height: size.height
      },
      thumbnailUrl: source.thumbnail.toDataURL(),
      appIconUrl: source.appIcon?.toDataURL() ?? null
    };
  }).sort((left, right) => {
    if (left.sourceType !== right.sourceType) {
      return left.sourceType === "screen" ? -1 : 1;
    }
    return left.name.localeCompare(right.name);
  });
};

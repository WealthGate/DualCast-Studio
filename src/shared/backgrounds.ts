export type BackgroundMedia = { id: string; name: string; kind: "image" | "video"; url: string; missing?: boolean };
export type BackgroundSelection = { kind: "none" | "image" | "video"; assetId: string; url: string; fit: "cover" | "contain"; opacity: number; color: string };
export type DisplayBackgrounds = { program?: BackgroundSelection; lowerThird?: BackgroundSelection; sanctuary?: BackgroundSelection; displays: Record<string, BackgroundSelection> };
export type BackgroundImportResult = { items: BackgroundMedia[]; errors: string[] };
export type BackgroundDeleteResult = { items: BackgroundMedia[] } & ({ deleted: false } | { deleted: true; backgrounds: DisplayBackgrounds });
export const emptyBackground: BackgroundSelection = { kind: "none", assetId: "", url: "", fit: "cover", opacity: 1, color: "#101722" };
const text = (value: unknown, limit: number) => typeof value === "string" ? value.slice(0, limit) : "";
export function normalizeBackground(value: unknown): BackgroundSelection {
  const raw = value && typeof value === "object" ? value as Partial<BackgroundSelection> : {};
  const kind = raw.kind === "image" || raw.kind === "video" ? raw.kind : "none";
  const url = text(raw.url, 10000);
  return { kind, assetId: text(raw.assetId, 100), url: kind === "none" ? "" : url,
    fit: raw.fit === "contain" ? "contain" : "cover",
    opacity: typeof raw.opacity === "number" && Number.isFinite(raw.opacity) ? Math.max(0, Math.min(1, raw.opacity)) : 1,
    color: typeof raw.color === "string" && /^#[\da-f]{6}$/i.test(raw.color) ? raw.color : emptyBackground.color };
}
export function normalizeDisplayBackgrounds(value: unknown): DisplayBackgrounds {
  const raw = value && typeof value === "object" ? value as Partial<DisplayBackgrounds> : {};
  const displays: Record<string, BackgroundSelection> = {};
  if (raw.displays && typeof raw.displays === "object") for (const [id, background] of Object.entries(raw.displays).slice(0, 64)) {
    if (id.length <= 150 && /^[\w.:-]+$/.test(id) && !["__proto__", "constructor", "prototype"].includes(id)) displays[id] = normalizeBackground(background);
  }
  return { displays, ...(raw.program ? { program: normalizeBackground(raw.program) } : {}),
    ...(raw.lowerThird ? { lowerThird: normalizeBackground(raw.lowerThird) } : {}),
    ...(raw.sanctuary ? { sanctuary: normalizeBackground(raw.sanctuary) } : {}) };
}

// Keep each output's color and layout when its uploaded media is deleted.
export function withoutBackgroundMedia(value: unknown, media: Pick<BackgroundMedia, "id" | "url">): DisplayBackgrounds {
  const backgrounds = normalizeDisplayBackgrounds(value);
  const clear = (selection: BackgroundSelection) => selection.assetId === media.id || (media.url && selection.url === media.url)
    ? { ...selection, kind: "none" as const, assetId: "", url: "" } : selection;
  for (const key of ["program", "sanctuary", "lowerThird"] as const) if (backgrounds[key]) backgrounds[key] = clear(backgrounds[key]!);
  for (const id of Object.keys(backgrounds.displays)) backgrounds.displays[id] = clear(backgrounds.displays[id]);
  return backgrounds;
}

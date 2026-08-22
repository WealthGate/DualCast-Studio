import { Scene, Source, SourceCrop, SourceGroup, SourceRect, SourceType, StudioState } from "./types";

const sourceTypes = new Set<SourceType>(["display", "window", "camera", "image", "video", "browser", "audio", "text"]);
const clamp = (value: unknown, fallback: number, min: number, max: number) => {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(min, Math.min(max, number)) : fallback;
};
const cleanString = (value: unknown, fallback = "", maxLength = 500) =>
  typeof value === "string" ? value.slice(0, maxLength) : fallback;
const objectValue = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};

const normalizeRect = (value: unknown): SourceRect => {
  const rect = objectValue(value);
  const x = clamp(rect.x, 0, 0, 99);
  const y = clamp(rect.y, 0, 0, 99);
  return {
    x,
    y,
    width: clamp(rect.width, 100 - x, 1, 100 - x),
    height: clamp(rect.height, 100 - y, 1, 100 - y)
  };
};

const normalizeCrop = (value: unknown): SourceCrop => {
  const crop = objectValue(value);
  const left = clamp(crop.left, 0, 0, 95);
  const top = clamp(crop.top, 0, 0, 95);
  return {
    top,
    right: clamp(crop.right, 0, 0, 95 - left),
    bottom: clamp(crop.bottom, 0, 0, 95 - top),
    left
  };
};

const normalizeSource = (id: string, value: unknown): Source | null => {
  const source = objectValue(value);
  const type = sourceTypes.has(source.type as SourceType) ? source.type as SourceType : null;
  if (!type) return null;
  const data = objectValue(source.data);
  const base = {
    id,
    name: cleanString(source.name, "Source", 160) || "Source",
    type,
    rect: normalizeRect(source.rect),
    enabled: source.enabled !== false,
    audioEnabled: source.audioEnabled === true,
    audioScope: source.audioScope === "persistent" ? "persistent" as const : "scene" as const,
    captureCursor: (source.captureCursor === "motion" || source.captureCursor === "always" ? source.captureCursor : "never") as "never" | "motion" | "always",
    volume: clamp(source.volume, 1, 0, 2),
    rotation: clamp(source.rotation, 0, -360, 360),
    crop: normalizeCrop(source.crop),
    locked: source.locked === true,
    groupId: typeof source.groupId === "string" ? source.groupId : null,
    media: {
      paused: objectValue(source.media).paused === true,
      restartToken: clamp(objectValue(source.media).restartToken, 0, 0, Number.MAX_SAFE_INTEGER)
    }
  };

  if (type === "display" || type === "window") {
    return { ...base, type, data: { captureId: cleanString(data.captureId, "", 500) } };
  }
  if (type === "camera") {
    return { ...base, type, data: { deviceId: cleanString(data.deviceId, "", 500) } };
  }
  if (type === "image") {
    return { ...base, type, data: { url: cleanString(data.url, "", 4_096) } };
  }
  if (type === "video" || type === "audio") {
    return { ...base, type, data: { url: cleanString(data.url, "", 4_096), loop: data.loop === true } };
  }
  if (type === "browser") {
    return { ...base, type, data: { url: cleanString(data.url, "", 4_096) } };
  }
  return {
    ...base,
    type: "text",
    data: {
      text: cleanString(data.text, "", 100_000),
      fontSize: clamp(data.fontSize, 48, 8, 400),
      color: cleanString(data.color, "#ffffff", 64),
      backgroundColor: cleanString(data.backgroundColor, "transparent", 64),
      align: data.align === "left" || data.align === "right" ? data.align : "center",
      role: data.role === "lower-third" || data.role === "presentation" ? data.role : "standard"
    }
  };
};

export const normalizeStudioState = (value: unknown): StudioState => {
  const raw = objectValue(value);
  const rawSources = objectValue(raw.sources);
  const sources = Object.fromEntries(
    Object.entries(rawSources).flatMap(([id, source]) => {
      if (!id || id.length > 200) return [];
      const normalized = normalizeSource(id, source);
      return normalized ? [[id, normalized]] : [];
    })
  ) as Record<string, Source>;

  const seenGroups = new Set<string>();
  const groups: SourceGroup[] = (Array.isArray(raw.groups) ? raw.groups : []).flatMap((value) => {
    const group = objectValue(value);
    const id = cleanString(group.id, "", 200);
    if (!id || seenGroups.has(id)) return [];
    seenGroups.add(id);
    return [{ id, name: cleanString(group.name, "Group", 160) || "Group", locked: group.locked === true }];
  });
  Object.values(sources).forEach((source) => {
    if (source.groupId && !seenGroups.has(source.groupId)) source.groupId = null;
  });

  const seenScenes = new Set<string>();
  const scenes: Scene[] = (Array.isArray(raw.scenes) ? raw.scenes : []).flatMap((value) => {
    const scene = objectValue(value);
    const id = cleanString(scene.id, "", 200);
    if (!id || seenScenes.has(id)) return [];
    seenScenes.add(id);
    const sourceIds = Array.isArray(scene.sourceIds)
      ? Array.from(new Set(scene.sourceIds.filter((sourceId): sourceId is string => typeof sourceId === "string" && Boolean(sources[sourceId]))))
      : [];
    return [{ id, name: cleanString(scene.name, "Scene", 160) || "Scene", sourceIds, locked: scene.locked === true }];
  });
  if (scenes.length === 0) {
    scenes.push({ id: "scene-1", name: "Scene 1", sourceIds: [] });
  }

  const requestedPreview = typeof raw.previewSceneId === "string" ? raw.previewSceneId : null;
  const requestedProgram = typeof raw.programSceneId === "string" ? raw.programSceneId : null;
  const previewSceneId = scenes.some((scene) => scene.id === requestedPreview) ? requestedPreview : scenes[0].id;
  const programSceneId = scenes.some((scene) => scene.id === requestedProgram) ? requestedProgram : previewSceneId;

  return { scenes, sources, groups, previewSceneId, programSceneId };
};

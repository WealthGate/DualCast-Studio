import { Settings } from "../../shared/types";

export type StudioProfile = {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  settings: Settings;
};

export const PROFILE_STORAGE_KEY = "openchurch:profiles:v1";
export const ACTIVE_PROFILE_KEY = "openchurch:active-profile:v1";

export const normalizeProfileName = (value: string, fallback = "Studio Profile") =>
  value.replace(/[\u0000-\u001f<>:"/\\|?*]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80) || fallback;

export const createStudioProfile = (name: string, settings: Settings, id: string = crypto.randomUUID(), now = new Date()): StudioProfile => ({
  id,
  name: normalizeProfileName(name),
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
  settings: structuredClone(settings)
});

export const isStudioProfile = (value: unknown): value is StudioProfile => {
  if (!value || typeof value !== "object") return false;
  const profile = value as Partial<StudioProfile>;
  const settings = profile.settings as Partial<Settings> | undefined;
  return typeof profile.id === "string"
    && typeof profile.name === "string"
    && typeof profile.createdAt === "string"
    && typeof profile.updatedAt === "string"
    && Boolean(settings)
    && Array.isArray(settings?.streamDestinations)
    && Boolean(settings?.studioState)
    && Array.isArray(settings?.studioState?.scenes);
};

export const parseStudioProfiles = (serialized: string | null) => {
  if (!serialized) return [];
  try {
    const parsed = JSON.parse(serialized) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isStudioProfile).slice(0, 100) : [];
  } catch {
    return [];
  }
};

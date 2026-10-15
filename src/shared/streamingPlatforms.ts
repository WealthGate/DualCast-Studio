import {
  StreamingFps,
  StreamingPreset,
  YouTubeBroadcastSettings
} from "./types";

export const YOUTUBE_VIDEO_CATEGORIES = [
  { id: "", label: "YouTube default" },
  { id: "1", label: "Film & Animation" },
  { id: "2", label: "Autos & Vehicles" },
  { id: "10", label: "Music" },
  { id: "15", label: "Pets & Animals" },
  { id: "17", label: "Sports" },
  { id: "19", label: "Travel & Events" },
  { id: "20", label: "Gaming" },
  { id: "22", label: "People & Blogs" },
  { id: "23", label: "Comedy" },
  { id: "24", label: "Entertainment" },
  { id: "25", label: "News & Politics" },
  { id: "26", label: "Howto & Style" },
  { id: "27", label: "Education" },
  { id: "28", label: "Science & Technology" },
  { id: "29", label: "Nonprofits & Activism" }
] as const;

export const DEFAULT_YOUTUBE_BROADCAST_SETTINGS: YouTubeBroadcastSettings = {
  title: "",
  description: "",
  visibility: "unlisted",
  categoryId: "29",
  madeForKids: false,
  scheduledStartTime: "",
  latencyPreference: "low",
  enableDvr: true,
  enableAutoStart: true,
  enableAutoStop: true,
  enableEmbed: true
};

const allowedVisibility = ["public", "unlisted", "private"] as const;
const allowedLatency = ["normal", "low", "ultraLow"] as const;

export const normalizeYouTubeBroadcastSettings = (
  value: Partial<YouTubeBroadcastSettings> | null | undefined
): YouTubeBroadcastSettings => ({
  title: typeof value?.title === "string" ? value.title.slice(0, 100) : "",
  description: typeof value?.description === "string" ? value.description.slice(0, 5_000) : "",
  visibility: allowedVisibility.includes(value?.visibility as YouTubeBroadcastSettings["visibility"])
    ? value?.visibility as YouTubeBroadcastSettings["visibility"]
    : DEFAULT_YOUTUBE_BROADCAST_SETTINGS.visibility,
  categoryId: typeof value?.categoryId === "string" && /^\d{0,4}$/.test(value.categoryId)
    ? value.categoryId
    : DEFAULT_YOUTUBE_BROADCAST_SETTINGS.categoryId,
  madeForKids: value?.madeForKids === true,
  scheduledStartTime: typeof value?.scheduledStartTime === "string"
    ? value.scheduledStartTime.slice(0, 40)
    : "",
  latencyPreference: allowedLatency.includes(value?.latencyPreference as YouTubeBroadcastSettings["latencyPreference"])
    ? value?.latencyPreference as YouTubeBroadcastSettings["latencyPreference"]
    : DEFAULT_YOUTUBE_BROADCAST_SETTINGS.latencyPreference,
  enableDvr: value?.enableDvr !== false,
  enableAutoStart: value?.enableAutoStart !== false,
  enableAutoStop: value?.enableAutoStop !== false,
  enableEmbed: value?.enableEmbed !== false
});

export const validateYouTubeBroadcastSettings = (
  value: YouTubeBroadcastSettings,
  now = Date.now()
): string | null => {
  const title = value.title.trim();
  if (!title) return "Enter a YouTube broadcast title.";
  if (title.length > 100) return "YouTube broadcast titles must be 100 characters or fewer.";
  if (value.description.length > 5_000) return "YouTube broadcast descriptions must be 5,000 characters or fewer.";
  if (value.categoryId && !/^\d{1,4}$/.test(value.categoryId)) return "Choose a valid YouTube category.";
  if (value.scheduledStartTime) {
    const scheduled = new Date(value.scheduledStartTime).getTime();
    if (!Number.isFinite(scheduled)) return "Choose a valid scheduled start time.";
    if (scheduled <= now) return "The scheduled start time must be in the future.";
  }
  return null;
};

export const getYouTubeScheduledStartTime = (
  value: YouTubeBroadcastSettings,
  now = Date.now()
) => value.scheduledStartTime
  ? new Date(value.scheduledStartTime).toISOString()
  : new Date(now + 5 * 60_000).toISOString();

export const buildYouTubeBroadcastResource = (
  value: YouTubeBroadcastSettings,
  now = Date.now()
) => {
  const snippet: Record<string, string> = {
    title: value.title.trim(),
    description: value.description.trim(),
    scheduledStartTime: getYouTubeScheduledStartTime(value, now)
  };
  if (value.categoryId) snippet.categoryId = value.categoryId;

  return {
    snippet,
    status: {
      privacyStatus: value.visibility,
      selfDeclaredMadeForKids: value.madeForKids
    },
    contentDetails: {
      monitorStream: { enableMonitorStream: false },
      latencyPreference: value.latencyPreference,
      enableDvr: value.enableDvr,
      enableAutoStart: value.enableAutoStart,
      enableAutoStop: value.enableAutoStop,
      enableEmbed: value.enableEmbed,
      recordFromStart: true,
      projection: "rectangular"
    }
  };
};

export const buildYouTubeStreamResource = (
  title: string,
  preset: StreamingPreset = "medium",
  fps: StreamingFps = 30
) => {
  const variableRate = fps < 30 || fps === 50;
  return {
    snippet: { title: `${title.trim()} - OpenChurch encoder` },
    cdn: {
      ingestionType: "rtmp",
      resolution: variableRate ? "variable" : preset === "low" ? "720p" : "1080p",
      frameRate: variableRate ? "variable" : fps === 60 ? "60fps" : "30fps"
    },
    contentDetails: { isReusable: true }
  };
};

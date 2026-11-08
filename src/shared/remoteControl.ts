import type { LowerThirdSlide, ScrollingTextData } from "./types";

export type RemoteCommand =
  | { action: "scene-preview" | "scene-live"; sceneId: string }
  | { action: "take"; transition: "cut" | "fade" | "crossfade" }
  | { action: "black" | "freeze" | "record" | "lower-third"; enabled: boolean }
  | { action: "text-mode"; mode: import("./displayText").DisplayTextMode }
  | { action: "text-stage"; text: string; title: string; lines: number }
  | { action: "scripture-stage"; reference: string }
  | { action: "text-live" | "text-clear" }
  | { action: "slide-cue"; slideId: string; live: boolean }
  | { action: "slide-step"; direction: -1 | 1; live: boolean }
  | { action: "ticker"; sourceId: string; text: string; speed: number; direction: ScrollingTextData["direction"]; enabled: boolean; paused: boolean }
  | { action: "master-gain"; gain: number };

export type RemoteCommandRequest = { id: string; command: RemoteCommand };
export type RemoteCommandResult = { ok: boolean; message: string };
export type RemoteCommandReply = RemoteCommandResult & { id: string };

// A deliberate allowlist: credentials, filesystem paths and provider settings
// never leave the desktop through the mobile control API.
export type RemoteControlState = {
  stationName: string;
  scenes: { id: string; name: string; cameras: string[]; enabled: boolean }[];
  previewSceneId: string | null;
  programSceneId: string | null;
  isBlack: boolean;
  isFrozen: boolean;
  isRecording: boolean;
  recordingSeconds: number;
  streamStatus: string;
  textMode: import("./displayText").DisplayTextMode;
  lowerThirdHidden: boolean;
  hasLogo: boolean;
  masterGain: number;
  slides: LowerThirdSlide[];
  activeSlideId: string | null;
  programSlideId: string | null;
  scriptureSource: string;
  tickers: { id: string; name: string; text: string; speed: number; direction: ScrollingTextData["direction"]; enabled: boolean; paused: boolean }[];
};

const string = (value: unknown, max: number) => typeof value === "string" && value.length > 0 && value.length <= max;
const number = (value: unknown, min: number, max: number) => typeof value === "number" && Number.isFinite(value) && value >= min && value <= max;
const choice = (value: unknown, options: string[]) => typeof value === "string" && options.includes(value);

export const isRemoteCommand = (value: unknown): value is RemoteCommand => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const c = value as Record<string, unknown>;
  switch (c.action) {
    case "scene-preview": case "scene-live": return string(c.sceneId, 200);
    case "take": return choice(c.transition, ["cut", "fade", "crossfade"]);
    case "black": case "freeze": case "record": case "lower-third": return typeof c.enabled === "boolean";
    case "text-mode": return choice(c.mode, ["show", "text-only", "hide", "theme", "logo"]);
    case "text-stage": return string(c.text, 10_000) && typeof c.title === "string" && c.title.length <= 120 && number(c.lines, 1, 6) && Number.isInteger(c.lines);
    case "scripture-stage": return string(c.reference, 160);
    case "text-live": case "text-clear": return true;
    case "slide-cue": return string(c.slideId, 200) && typeof c.live === "boolean";
    case "slide-step": return (c.direction === -1 || c.direction === 1) && typeof c.live === "boolean";
    case "master-gain": return number(c.gain, 0, 1);
    case "ticker": return string(c.sourceId, 200) && typeof c.text === "string" && c.text.length <= 10_000
      && number(c.speed, 0, 1000) && choice(c.direction, ["left", "right", "up", "down"])
      && typeof c.enabled === "boolean" && typeof c.paused === "boolean";
    default: return false;
  }
};

export const normalizeRemoteUrl = (value: unknown): string => {
  if (typeof value !== "string" || !value.trim()) return "";
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" && !url.username && !url.password && (url.pathname === "/" || url.pathname === "/operator") && !url.search && !url.hash
      ? url.origin : "";
  } catch { return ""; }
};

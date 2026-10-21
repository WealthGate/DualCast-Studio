import { Source } from "../../shared/types";

let capturePreviewProvider: ((id: string) => HTMLVideoElement | undefined) | null = null;
export const registerCapturePreviewProvider = (provider: (id: string) => HTMLVideoElement | undefined) => {
  capturePreviewProvider = provider;
  return () => { if (capturePreviewProvider === provider) capturePreviewProvider = null; };
};
export const getSourceCapturePreview = (id: string) => {
  const video = capturePreviewProvider?.(id);
  if (!video || video.readyState < 2 || !video.videoWidth) return null;
  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth; canvas.height = video.videoHeight;
  canvas.getContext("2d")?.drawImage(video, 0, 0);
  return canvas.toDataURL("image/jpeg", 0.9);
};

// Presentation data (text, position, crop, volume) must not restart capture.
export const sourceMediaSignature = (source: Source) => {
  switch (source.type) {
    case "display": case "window": return JSON.stringify([source.type, source.data.captureId, source.audioEnabled]);
    case "camera": return JSON.stringify([source.type, source.data.deviceId]);
    case "image": case "browser": return JSON.stringify([source.type, source.data.url]);
    case "audio": case "video": return JSON.stringify([source.type, source.data.url, source.data.loop]);
    default: return source.type;
  }
};

export const canShareSourceMedia = (source: Source) =>
  ["display", "window", "camera", "image"].includes(source.type);

export const sourceMediaReady = (source: Source, media?: { videoEl?: HTMLVideoElement; imageEl?: HTMLImageElement }) => {
  if (!source.enabled || source.type === "text" || source.type === "audio") return true;
  if (source.type === "image") return Boolean(media?.imageEl?.complete && media.imageEl.naturalWidth);
  return Boolean(media?.videoEl && media.videoEl.readyState >= 2 && media.videoEl.videoWidth > 0);
};

// Draw full outgoing pixels, then fade the complete incoming picture over them.
// Fading both layers with source-over loses 25% brightness at the midpoint.
export const compositeSceneBlend = (
  context: CanvasRenderingContext2D, outgoing: CanvasImageSource,
  incoming: CanvasImageSource, progress: number, width: number, height: number
) => {
  context.save();
  context.globalAlpha = 1;
  context.drawImage(outgoing, 0, 0, width, height);
  context.globalAlpha = Math.max(0, Math.min(1, progress));
  context.drawImage(incoming, 0, 0, width, height);
  context.restore();
};

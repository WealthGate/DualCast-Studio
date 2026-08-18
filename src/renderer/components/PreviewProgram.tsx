import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { getCameraStream, getDisplayStream, stopMediaStream } from "../utils/media";
import { fitToBounds, getQualityProfile } from "../../shared/recording";
import { Scene, Source, SourceRect } from "../../shared/types";

type PreviewProgramProps = {
  programCanvasRef: React.RefObject<HTMLCanvasElement>;
};

type SourceMedia = {
  signature: string;
  type: Source["type"];
  videoEl?: HTMLVideoElement;
  imageEl?: HTMLImageElement;
  audioEl?: HTMLAudioElement;
  stream?: MediaStream;
  captureStream?: MediaStream;
  lastRestartToken?: number;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const getSignature = (source: Source) =>
  JSON.stringify({
    type: source.type,
    data: source.data,
    audioEnabled: source.audioEnabled
  });

const PreviewProgram: React.FC<PreviewProgramProps> = ({ programCanvasRef }) => {
  const {
    scenes,
    sources,
    previewSceneId,
    programSceneId,
    selectedSourceId,
    isCutToBlack,
    isFrozen,
    settings,
    isProjecting,
    isLowerThirdProjecting,
    updateSourceRect,
    setSelectedSourceId,
    persistStudioState,
    setProgramAudioStream,
    setIsProjecting,
    setIsLowerThirdProjecting,
    transitionType,
    transitionDurationMs
  } = useAppStore();

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const sourceMediaRef = useRef<Map<string, SourceMedia>>(new Map());
  const browserFramesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const browserSizeRef = useRef<Map<string, { width: number; height: number; url: string }>>(new Map());
  const [previewSize, setPreviewSize] = useState({ width: 1, height: 1 });
  const [isMultiviewOpen, setIsMultiviewOpen] = useState(false);
  const [guides, setGuides] = useState<{ vertical: number[]; horizontal: number[] }>({ vertical: [], horizontal: [] });
  const transitionRef = useRef<{
    type: "fade" | "crossfade";
    startAt: number;
    duration: number;
    fromSceneId: string | null;
    toSceneId: string | null;
  } | null>(null);
  const prevProgramSceneIdRef = useRef<string | null>(null);

  const programScene = useMemo(() => scenes.find((scene) => scene.id === programSceneId) ?? null, [programSceneId, scenes]);
  const previewScene = useMemo(() => scenes.find((scene) => scene.id === previewSceneId) ?? null, [previewSceneId, scenes]);
  const previewSceneLocked = Boolean(previewScene?.locked);
  const activeSourceIds = useMemo(() => {
    const ids = new Set<string>();
    if (isMultiviewOpen) {
      scenes.forEach((scene) => scene.sourceIds.forEach((id) => ids.add(id)));
      return ids;
    }
    if (programScene) {
      programScene.sourceIds.forEach((id) => ids.add(id));
    }
    if (previewScene) {
      previewScene.sourceIds.forEach((id) => ids.add(id));
    }
    return ids;
  }, [isMultiviewOpen, programScene, previewScene, scenes]);

  const profile = getQualityProfile(settings.qualityPreset);
  const programSize = { width: profile.maxWidth, height: profile.maxHeight };
  const previewCanvasSize = fitToBounds(programSize.width, programSize.height, previewSize.width, previewSize.height);

  useEffect(() => {
    const prev = prevProgramSceneIdRef.current;
    if (prev && prev !== programSceneId && transitionType !== "cut") {
      transitionRef.current = {
        type: transitionType === "fade" ? "fade" : "crossfade",
        startAt: performance.now(),
        duration: transitionDurationMs,
        fromSceneId: prev,
        toSceneId: programSceneId
      };
    }
    prevProgramSceneIdRef.current = programSceneId;
  }, [programSceneId, transitionType, transitionDurationMs]);

  useEffect(() => {
    const element = previewContainerRef.current;
    if (!element) {
      return;
    }
    const resizeObserver = new ResizeObserver(() => {
      setPreviewSize({
        width: element.clientWidth || 1,
        height: element.clientHeight || 1
      });
    });
    resizeObserver.observe(element);
    return () => {
      resizeObserver.disconnect();
    };
  }, []);

  useEffect(() => {
    const unsubscribeOpen = window.dualcast.onProjectionOpened(() => setIsProjecting(true));
    const unsubscribeClose = window.dualcast.onProjectionClosed(() => setIsProjecting(false));
    const unsubscribeLowerOpen = window.dualcast.onLowerThirdOpened(() => setIsLowerThirdProjecting(true));
    const unsubscribeLowerClose = window.dualcast.onLowerThirdClosed(() => setIsLowerThirdProjecting(false));
    const unsubscribeMultiviewOpen = window.dualcast.onMultiviewOpened(() => setIsMultiviewOpen(true));
    const unsubscribeMultiviewClose = window.dualcast.onMultiviewClosed(() => setIsMultiviewOpen(false));
    const unsubscribeBrowser = window.dualcast.onBrowserFrame((payload) => {
      const img = new Image();
      img.onload = () => {
        browserFramesRef.current.set(payload.sourceId, img);
      };
      img.src = payload.dataUrl;
    });

    return () => {
      unsubscribeOpen();
      unsubscribeClose();
      unsubscribeLowerOpen();
      unsubscribeLowerClose();
      unsubscribeMultiviewOpen();
      unsubscribeMultiviewClose();
      unsubscribeBrowser();
    };
  }, []);

  useEffect(() => {
    const mediaMap = sourceMediaRef.current;

    const cleanup = (sourceId: string, entry: SourceMedia) => {
      stopMediaStream(entry.stream ?? null);
      stopMediaStream(entry.captureStream ?? null);
      entry.videoEl?.pause();
      entry.audioEl?.pause();
      if (entry.type === "browser") {
        window.dualcast.destroyBrowserSource({ sourceId }).catch(() => undefined);
      }
    };

    const createMedia = async (source: Source) => {
      const signature = getSignature(source);
      const entry: SourceMedia = { signature, type: source.type };

      if (source.type === "display" || source.type === "window") {
        const video = document.createElement("video");
        video.playsInline = true;
        video.muted = true;
        video.autoplay = true;
        try {
          const stream = await getDisplayStream(source.data.captureId, source.audioEnabled);
          entry.stream = stream;
          video.srcObject = stream;
          await video.play();
        } catch {
          // Ignore capture failures; user can retry.
        }
        entry.videoEl = video;
      } else if (source.type === "camera") {
        const video = document.createElement("video");
        video.playsInline = true;
        video.muted = true;
        video.autoplay = true;
        try {
          const stream = await getCameraStream(source.data.deviceId);
          entry.stream = stream;
          video.srcObject = stream;
          await video.play();
        } catch {
          // Ignore camera failures; user can retry.
        }
        entry.videoEl = video;
      } else if (source.type === "image") {
        const img = new Image();
        img.src = source.data.url;
        entry.imageEl = img;
      } else if (source.type === "video") {
        const video = document.createElement("video");
        video.src = source.data.url;
        video.loop = source.data.loop;
        video.muted = true;
        video.playsInline = true;
        video.autoplay = true;
        video.crossOrigin = "anonymous";
        video.addEventListener("loadedmetadata", () => {
          if (video.paused) {
            video.play().catch(() => undefined);
          }
        });
        video.play().catch(() => undefined);
        entry.videoEl = video;
        try {
          entry.captureStream = (
            video as HTMLVideoElement & { captureStream?: () => MediaStream }
          ).captureStream?.();
        } catch {
          // captureStream is optional.
        }
      } else if (source.type === "audio") {
        const audio = document.createElement("audio");
        audio.src = source.data.url;
        audio.loop = source.data.loop;
        audio.muted = true;
        audio.autoplay = true;
        audio.crossOrigin = "anonymous";
        audio.play().catch(() => undefined);
        entry.audioEl = audio;
        try {
          entry.captureStream = (
            audio as HTMLAudioElement & { captureStream?: () => MediaStream }
          ).captureStream?.();
        } catch {
          // captureStream is optional.
        }
      } else if (source.type === "browser") {
        window.dualcast
          .createBrowserSource({
            sourceId: source.id,
            url: source.data.url,
            width: Math.max(1, Math.round(programSize.width * (source.rect.width / 100))),
            height: Math.max(1, Math.round(programSize.height * (source.rect.height / 100)))
          })
          .catch(() => undefined);
      }

      mediaMap.set(source.id, entry);
    };

    activeSourceIds.forEach((id) => {
      const source = sources[id];
      if (!source) {
        return;
      }
      const entry = mediaMap.get(id);
      const signature = getSignature(source);
      if (entry && entry.signature === signature) {
        return;
      }
      if (entry) {
        cleanup(id, entry);
      }
      createMedia(source).catch(() => undefined);
    });

    Array.from(mediaMap.entries()).forEach(([id, entry]) => {
      if (!activeSourceIds.has(id)) {
        cleanup(id, entry);
        mediaMap.delete(id);
        browserFramesRef.current.delete(id);
        browserSizeRef.current.delete(id);
      }
    });
  }, [activeSourceIds, sources, programSize.height, programSize.width]);

  useEffect(() => {
    activeSourceIds.forEach((id) => {
      const source = sources[id];
      if (!source) {
        return;
      }
      const media = sourceMediaRef.current.get(id);
      if (!media) {
        return;
      }
      const paused = source.media?.paused ?? false;
      if (source.type === "video" && media.videoEl) {
        media.videoEl.loop = source.data.loop;
        if (media.lastRestartToken !== source.media?.restartToken) {
          media.videoEl.currentTime = 0;
          media.lastRestartToken = source.media?.restartToken;
        }
        if (paused) {
          media.videoEl.pause();
        } else {
          media.videoEl.play().catch(() => undefined);
        }
      }
      if (source.type === "audio" && media.audioEl) {
        media.audioEl.loop = source.data.loop;
        if (media.lastRestartToken !== source.media?.restartToken) {
          media.audioEl.currentTime = 0;
          media.lastRestartToken = source.media?.restartToken;
        }
        if (paused) {
          media.audioEl.pause();
        } else {
          media.audioEl.play().catch(() => undefined);
        }
      }
    });
  }, [activeSourceIds, sources]);

  useEffect(() => {
    const scene = programScene;
    if (!scene || scene.sourceIds.length === 0) {
      setProgramAudioStream(null);
      return;
    }

    const hasAudioSources = scene.sourceIds.some((id) => {
      const source = sources[id];
      if (!source || !source.enabled || !source.audioEnabled) {
        return false;
      }
      return source.type === "display" || source.type === "window" || source.type === "video" || source.type === "audio";
    });

    if (!hasAudioSources) {
      setProgramAudioStream(null);
      return;
    }

    const audioContext = new AudioContext();
    const destination = audioContext.createMediaStreamDestination();
    const masterGain = audioContext.createGain();
    masterGain.gain.value = Math.max(0, Math.min(2, settings.masterAudioGain ?? 1));
    masterGain.connect(destination);

    scene.sourceIds.forEach((id) => {
      const source = sources[id];
      if (!source || !source.enabled || !source.audioEnabled) {
        return;
      }
      const media = sourceMediaRef.current.get(id);
      const sourceGain = audioContext.createGain();
      sourceGain.gain.value = Math.max(0, Math.min(2, source.volume ?? 1));
      sourceGain.connect(masterGain);
      if (source.type === "display" || source.type === "window") {
        if (media?.stream && media.stream.getAudioTracks().length > 0) {
          const streamSource = audioContext.createMediaStreamSource(media.stream);
          streamSource.connect(sourceGain);
        }
      } else if (source.type === "video" || source.type === "audio") {
        if (media?.captureStream && media.captureStream.getAudioTracks().length > 0) {
          const streamSource = audioContext.createMediaStreamSource(media.captureStream);
          streamSource.connect(sourceGain);
        }
      }
    });

    setProgramAudioStream(destination.stream);

    return () => {
      setProgramAudioStream(null);
      audioContext.close().catch(() => undefined);
    };
  }, [programScene, settings.masterAudioGain, sources, setProgramAudioStream]);

  const drawSource = (
    ctx: CanvasRenderingContext2D,
    source: Source,
    canvasWidth: number,
    canvasHeight: number
  ) => {
    if (!source.enabled || source.type === "audio") {
      return;
    }

    const rect = source.rect;
    const x = (rect.x / 100) * canvasWidth;
    const y = (rect.y / 100) * canvasHeight;
    const width = (rect.width / 100) * canvasWidth;
    const height = (rect.height / 100) * canvasHeight;
    const rotation = ((source.rotation ?? 0) * Math.PI) / 180;
    const media = sourceMediaRef.current.get(source.id);

    let drawable: CanvasImageSource | null = null;
    if (source.type === "image" && media?.imageEl) {
      drawable = media.imageEl;
    } else if (
      (source.type === "display" || source.type === "window" || source.type === "camera") &&
      media?.videoEl
    ) {
      drawable = media.videoEl;
    } else if (source.type === "video" && media?.videoEl) {
      drawable = media.videoEl;
    } else if (source.type === "browser") {
      const frame = browserFramesRef.current.get(source.id);
      if (frame) {
        drawable = frame;
      }
    }

    if (source.type === "text") {
      const padding = Math.max(12, source.data.fontSize * 0.28);
      const lineHeight = source.data.fontSize * 1.18;
      const maxTextWidth = Math.max(1, width - padding * 2);
      ctx.font = `${source.data.fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
      const paragraphs = source.data.text.split(/\r?\n/);
      const lines = paragraphs.flatMap((paragraph) => {
        const words = paragraph.split(/\s+/).filter(Boolean);
        if (words.length === 0) {
          return [""];
        }
        return words.reduce<string[]>((wrapped, word) => {
          const current = wrapped[wrapped.length - 1] ?? "";
          const next = current ? `${current} ${word}` : word;
          if (ctx.measureText(next).width <= maxTextWidth || !current) {
            wrapped[wrapped.length - 1] = next;
          } else {
            wrapped.push(word);
          }
          return wrapped;
        }, [""]);
      });

      ctx.save();
      ctx.translate(x + width / 2, y + height / 2);
      if (rotation) {
        ctx.rotate(rotation);
      }
      ctx.fillStyle = source.data.backgroundColor || "transparent";
      ctx.fillRect(-width / 2, -height / 2, width, height);
      ctx.fillStyle = source.data.color || "#ffffff";
      ctx.textBaseline = "top";
      ctx.textAlign = source.data.align;
      const textX =
        source.data.align === "left" ? -width / 2 + padding : source.data.align === "right" ? width / 2 - padding : 0;
      const startY = -Math.min(lines.length * lineHeight, height - padding * 2) / 2;
      lines.forEach((line, index) => {
        const textY = startY + index * lineHeight;
        if (textY + lineHeight <= height / 2) {
          ctx.fillText(line, textX, textY, maxTextWidth);
        }
      });
      ctx.restore();
      return;
    }

    if (!drawable) {
      return;
    }

    ctx.save();
    ctx.translate(x + width / 2, y + height / 2);
    if (rotation) {
      ctx.rotate(rotation);
    }
    ctx.drawImage(drawable, -width / 2, -height / 2, width, height);
    ctx.restore();
  };

  const drawScene = (ctx: CanvasRenderingContext2D, scene: Scene | null, canvasWidth: number, canvasHeight: number) => {
    if (!scene) {
      return;
    }
    scene.sourceIds.forEach((id) => {
      const source = sources[id];
      if (!source) {
        return;
      }
      drawSource(ctx, source, canvasWidth, canvasHeight);
    });
  };

  const syncBrowserSources = (scene: Scene | null, canvasWidth: number, canvasHeight: number) => {
    if (!scene) {
      return;
    }
    scene.sourceIds.forEach((id) => {
      const source = sources[id];
      if (!source || source.type !== "browser") {
        return;
      }
      const rect = source.rect;
      const width = (rect.width / 100) * canvasWidth;
      const height = (rect.height / 100) * canvasHeight;
      const current = browserSizeRef.current.get(id);
      const next = {
        width: Math.max(1, Math.round(width)),
        height: Math.max(1, Math.round(height)),
        url: source.data.url
      };
      if (!current || current.width !== next.width || current.height !== next.height || current.url !== next.url) {
        browserSizeRef.current.set(id, next);
        window.dualcast
          .updateBrowserSource({
            sourceId: id,
            url: source.data.url,
            width: next.width,
            height: next.height
          })
          .catch(() => undefined);
      }
    });
  };

  useEffect(() => {
    if (!isMultiviewOpen) {
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const encodeCanvas = () => {
      try {
        return canvas.toDataURL("image/webp", 0.68);
      } catch {
        return canvas.toDataURL("image/jpeg", 0.68);
      }
    };

    const sendMultiview = () => {
      const sceneTiles = scenes.map((scene) => {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        drawScene(ctx, scene, canvas.width, canvas.height);
        return {
          id: `scene:${scene.id}`,
          kind: "scene" as const,
          name: scene.name,
          sceneId: scene.id,
          subtitle: `${scene.sourceIds.length} source${scene.sourceIds.length === 1 ? "" : "s"}`,
          dataUrl: encodeCanvas()
        };
      });

      const cameraTiles = Object.values(sources).flatMap((source) => {
        if (source.type !== "camera") {
          return [];
        }
        const scene = scenes.find((candidate) => candidate.sourceIds.includes(source.id));
        if (!scene) {
          return [];
        }
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        const video = sourceMediaRef.current.get(source.id)?.videoEl;
        if (video && video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        }
        return [{
          id: `camera:${source.id}`,
          kind: "camera" as const,
          name: source.name,
          sceneId: scene.id,
          subtitle: `Routes ${scene.name}`,
          dataUrl: encodeCanvas()
        }];
      });

      window.dualcast.sendMultiviewData({
        previewSceneId,
        programSceneId,
        tiles: [...sceneTiles, ...cameraTiles]
      });
    };

    sendMultiview();
    const interval = window.setInterval(sendMultiview, 500);
    return () => window.clearInterval(interval);
  }, [isMultiviewOpen, previewSceneId, programSceneId, scenes, sources]);

  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) {
      return;
    }
    canvas.width = programSize.width;
    canvas.height = programSize.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    let rafId: number | null = null;

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      drawScene(ctx, previewScene, canvas.width, canvas.height);

      rafId = requestAnimationFrame(render);
    };

    render();
    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [previewScene, sources, programSize.height, programSize.width]);

  useEffect(() => {
    const canvas = programCanvasRef.current;
    if (!canvas) {
      return;
    }
    canvas.width = programSize.width;
    canvas.height = programSize.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    let rafId: number | null = null;

    const render = () => {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (!isCutToBlack) {
        const transition = transitionRef.current;
        if (
          transition &&
          transition.fromSceneId &&
          transition.toSceneId &&
          performance.now() - transition.startAt < transition.duration
        ) {
          const elapsed = performance.now() - transition.startAt;
          const progress = Math.min(1, elapsed / transition.duration);
          const fromScene = scenes.find((scene) => scene.id === transition.fromSceneId) ?? null;
          const toScene = scenes.find((scene) => scene.id === transition.toSceneId) ?? null;

          if (transition.type === "crossfade") {
            ctx.save();
            ctx.globalAlpha = 1 - progress;
            drawScene(ctx, fromScene, canvas.width, canvas.height);
            ctx.globalAlpha = progress;
            drawScene(ctx, toScene, canvas.width, canvas.height);
            ctx.restore();
          } else {
            if (progress < 0.5) {
              ctx.save();
              ctx.globalAlpha = 1 - progress * 2;
              drawScene(ctx, fromScene, canvas.width, canvas.height);
              ctx.restore();
            } else {
              ctx.save();
              ctx.globalAlpha = (progress - 0.5) * 2;
              drawScene(ctx, toScene, canvas.width, canvas.height);
              ctx.restore();
            }
          }

          syncBrowserSources(toScene ?? fromScene, canvas.width, canvas.height);
        } else {
          if (transition) {
            transitionRef.current = null;
          }
          drawScene(ctx, programScene, canvas.width, canvas.height);
          syncBrowserSources(programScene, canvas.width, canvas.height);
        }
      }

      if (!isFrozen) {
        rafId = requestAnimationFrame(render);
      }
    };

    render();

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [
    programScene,
    scenes,
    sources,
    isCutToBlack,
    isFrozen,
    programCanvasRef,
    programSize.height,
    programSize.width
  ]);

  useEffect(() => {
    if (!isProjecting && !settings.networkOutput.enabled) {
      return;
    }

    const sendFrame = () => {
      const canvas = programCanvasRef.current;
      if (!canvas) {
        return;
      }
      try {
        const dataUrl = canvas.toDataURL("image/webp", 0.8);
        window.dualcast.sendProgramFrame(dataUrl);
      } catch {
        const dataUrl = canvas.toDataURL("image/png");
        window.dualcast.sendProgramFrame(dataUrl);
      }
    };

    sendFrame();
    const interval = window.setInterval(sendFrame, 1000 / 15);

    return () => {
      window.clearInterval(interval);
    };
  }, [isProjecting, programCanvasRef, settings.networkOutput.enabled]);

  useEffect(() => {
    if (!isLowerThirdProjecting) {
      return;
    }

    const canvas = document.createElement("canvas");
    canvas.width = programSize.width;
    canvas.height = programSize.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const sendLowerThirdFrame = () => {
      ctx.fillStyle = settings.lowerThird.backgroundColor || "#000000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      if (!isCutToBlack && programScene) {
        programScene.sourceIds.forEach((id) => {
          const source = sources[id];
          if (source?.type === "text" && source.data.role === "lower-third") {
            drawSource(ctx, source, canvas.width, canvas.height);
          }
        });
      }
      window.dualcast.sendLowerThirdFrame(canvas.toDataURL("image/webp", 0.9));
    };

    sendLowerThirdFrame();
    const interval = window.setInterval(sendLowerThirdFrame, 1000 / 15);
    return () => window.clearInterval(interval);
  }, [
    isCutToBlack,
    isLowerThirdProjecting,
    programScene,
    programSize.height,
    programSize.width,
    settings.lowerThird.backgroundColor,
    sources
  ]);

  const hasPreviewScene = Boolean(previewScene && previewScene.sourceIds.length > 0);

  const handlePointerDrag = (
    event: React.PointerEvent<HTMLElement>,
    sourceId: string,
    mode: "move" | "resize",
    handle?: "nw" | "ne" | "sw" | "se"
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const stage = event.currentTarget.closest(".canvas-stage") as HTMLDivElement | null;
    if (!stage) {
      return;
    }
    if (previewSceneLocked) {
      return;
    }
    const rect = stage.getBoundingClientRect();
    const source = sources[sourceId];
    if (!source || source.locked) {
      return;
    }
    setSelectedSourceId(sourceId);

    const startX = event.clientX;
    const startY = event.clientY;
    const startRect = { ...source.rect };

    const snapRect = (nextRect: SourceRect) => {
      const threshold = 1.2;
      const guides: { vertical: number[]; horizontal: number[] } = { vertical: [], horizontal: [] };

      const snapAxis = (
        start: number,
        size: number,
        targets: number[]
      ): { start: number; guide?: number } => {
        const left = start;
        const right = start + size;
        const center = start + size / 2;

        for (const target of targets) {
          if (Math.abs(left - target) <= threshold) {
            return { start: target, guide: target };
          }
          if (Math.abs(right - target) <= threshold) {
            return { start: target - size, guide: target };
          }
          if (Math.abs(center - target) <= threshold) {
            return { start: target - size / 2, guide: target };
          }
        }
        return { start };
      };

      const horizontal = snapAxis(nextRect.x, nextRect.width, [0, 50, 100]);
      const vertical = snapAxis(nextRect.y, nextRect.height, [0, 50, 100]);

      const snapped = {
        ...nextRect,
        x: clamp(horizontal.start, 0, 100 - nextRect.width),
        y: clamp(vertical.start, 0, 100 - nextRect.height)
      };

      if (horizontal.guide !== undefined) {
        guides.vertical.push(horizontal.guide);
      }
      if (vertical.guide !== undefined) {
        guides.horizontal.push(vertical.guide);
      }

      return { rect: snapped, guides };
    };

    const onMove = (moveEvent: PointerEvent) => {
      const deltaX = ((moveEvent.clientX - startX) / rect.width) * 100;
      const deltaY = ((moveEvent.clientY - startY) / rect.height) * 100;
      let next: SourceRect = { ...startRect };

      if (mode === "move") {
        next = {
          ...startRect,
          x: clamp(startRect.x + deltaX, 0, 100 - startRect.width),
          y: clamp(startRect.y + deltaY, 0, 100 - startRect.height)
        };
      } else if (mode === "resize" && handle) {
        let x = startRect.x;
        let y = startRect.y;
        let width = startRect.width;
        let height = startRect.height;

        if (handle.includes("e")) {
          width = clamp(startRect.width + deltaX, 2, 100 - startRect.x);
        }
        if (handle.includes("s")) {
          height = clamp(startRect.height + deltaY, 2, 100 - startRect.y);
        }
        if (handle.includes("w")) {
          const nextWidth = clamp(startRect.width - deltaX, 2, 100);
          x = clamp(startRect.x + deltaX, 0, startRect.x + startRect.width - 2);
          width = clamp(nextWidth, 2, 100 - x);
        }
        if (handle.includes("n")) {
          const nextHeight = clamp(startRect.height - deltaY, 2, 100);
          y = clamp(startRect.y + deltaY, 0, startRect.y + startRect.height - 2);
          height = clamp(nextHeight, 2, 100 - y);
        }

        next = { x, y, width, height };
      }

      const snapped = snapRect(next);
      updateSourceRect(sourceId, snapped.rect);
      setGuides(snapped.guides);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      persistStudioState().catch(() => undefined);
      setGuides({ vertical: [], horizontal: [] });
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  return (
    <section className="preview-program">
      <div className="pane">
        <div className="pane-header">
          <h2>Preview</h2>
          <span className="tag">{hasPreviewScene ? "Staged" : "No Scene"}</span>
        </div>
        <div className="pane-body preview-body" ref={previewContainerRef}>
          <div className="canvas-stage" style={{ width: previewCanvasSize.width, height: previewCanvasSize.height }}>
            <canvas ref={previewCanvasRef} className="video-surface" />
            <div className="source-overlay">
              {previewScene
                ? previewScene.sourceIds
                    .map((id) => sources[id])
                    .filter(Boolean)
                    .filter((source) => source.type !== "audio")
                    .map((source) => {
                      const rect = source.rect;
                      const style = {
                        left: `${rect.x}%`,
                        top: `${rect.y}%`,
                        width: `${rect.width}%`,
                        height: `${rect.height}%`
                      };
                      return (
                        <div
                          key={source.id}
                          className={`source-box ${selectedSourceId === source.id ? "selected" : ""} ${
                            source.enabled ? "" : "disabled"
                          } ${source.locked ? "locked" : ""}`}
                          style={style}
                          onPointerDown={(event) => handlePointerDrag(event, source.id, "move")}
                        >
                          <span className="source-title">{source.name}</span>
                          {!source.locked ? (
                            <>
                              <span className="resize-handle nw" onPointerDown={(event) => handlePointerDrag(event, source.id, "resize", "nw")} />
                              <span className="resize-handle ne" onPointerDown={(event) => handlePointerDrag(event, source.id, "resize", "ne")} />
                              <span className="resize-handle sw" onPointerDown={(event) => handlePointerDrag(event, source.id, "resize", "sw")} />
                              <span className="resize-handle se" onPointerDown={(event) => handlePointerDrag(event, source.id, "resize", "se")} />
                            </>
                          ) : null}
                        </div>
                      );
                    })
                : null}
              {guides.vertical.map((value) => (
                <div key={`v-${value}`} className="guide guide-vertical" style={{ left: `${value}%` }} />
              ))}
              {guides.horizontal.map((value) => (
                <div key={`h-${value}`} className="guide guide-horizontal" style={{ top: `${value}%` }} />
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className="pane">
        <div className="pane-header program-header">
          <h2>Program</h2>
          <span className={isCutToBlack ? "tag alert" : "tag"}>{isCutToBlack ? "BLACK" : "LIVE"}</span>
        </div>
        <div className="pane-body program-body">
          <canvas ref={programCanvasRef} className="video-surface" />
        </div>
      </div>
    </section>
  );
};

export default PreviewProgram;

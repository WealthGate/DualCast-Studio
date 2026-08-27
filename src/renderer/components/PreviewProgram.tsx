import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { isPresentationTextSource, visiblePresentationSourceIds } from "../utils/presentationText";
import { getCameraStream, getDisplayStream, stopMediaStream } from "../utils/media";
import { fitToBounds, getQualityProfile } from "../../shared/recording";
import { LowerThirdAnimation, LowerThirdSlide, Scene, Source, SourceRect, WorkspaceViewMode } from "../../shared/types";
import { AudioMeterSnapshot, publishAudioMeters } from "../audioMeterBus";
import { createProgramAudioMonitor, updateProgramAudioMonitor } from "../utils/audioMonitoring";

type PreviewProgramProps = {
  programCanvasRef: React.RefObject<HTMLCanvasElement>;
  viewMode?: WorkspaceViewMode;
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
    audioEnabled: source.audioEnabled,
    captureCursor: source.captureCursor ?? "never"
  });

export const collectActiveSourceIds = (
  isMultiviewOpen: boolean,
  scenes: Scene[],
  programScene: Scene | null,
  previewScene: Scene | null,
  sources?: Record<string, Source>
) => {
  const ids = new Set<string>();
  if (isMultiviewOpen) {
    scenes.forEach((scene) => scene.sourceIds.forEach((id) => ids.add(id)));
  }
  programScene?.sourceIds.forEach((id) => ids.add(id));
  previewScene?.sourceIds.forEach((id) => ids.add(id));
  Object.values(sources ?? {}).forEach((source) => {
    if (source.audioScope === "persistent" && source.audioEnabled && source.enabled) {
      ids.add(source.id);
    }
  });
  if (sources) {
    Array.from(ids).forEach((id) => {
      if (sources[id] && !sources[id].enabled) {
        ids.delete(id);
      }
    });
  }
  return ids;
};

const supportsProgramAudio = (source: Source) =>
  source.type === "display" ||
  source.type === "window" ||
  source.type === "video" ||
  source.type === "audio";

const sourceMeterId = (sourceId: string) => sourceId.replace(/^program:/, "");

const levelFromAnalyser = (analyser: AnalyserNode, buffer: Uint8Array<ArrayBuffer>) => {
  analyser.getByteTimeDomainData(buffer);
  let peak = 0;
  for (let index = 0; index < buffer.length; index += 1) {
    peak = Math.max(peak, Math.abs((buffer[index] - 128) / 128));
  }
  const db = peak > 0 ? 20 * Math.log10(peak) : -60;
  return {
    normalized: clamp((db + 60) / 60, 0, 1),
    clipping: peak >= 0.985
  };
};

const cleanupSourceMedia = (sourceId: string, entry: SourceMedia) => {
  stopMediaStream(entry.stream ?? null);
  stopMediaStream(entry.captureStream ?? null);
  entry.videoEl?.pause();
  entry.audioEl?.pause();
  if (entry.type === "browser") {
    window.dualcast.destroyBrowserSource({ sourceId }).catch(() => undefined);
  }
};

const PreviewProgram: React.FC<PreviewProgramProps> = ({ programCanvasRef, viewMode = "studio" }) => {
  const {
    scenes,
    sources,
    previewSceneId,
    programSceneId,
    programSceneSnapshot,
    programSources,
    programRevision,
    selectedSourceId,
    isCutToBlack,
    isFrozen,
    settings,
    isProjecting,
    isLowerThirdProjecting,
    updateSourceRect,
    setSelectedSourceId,
    takeToProgram,
    persistStudioState,
    setProgramAudioStream,
    isProgramAudioMonitoring,
    programAudioMonitorGain,
    setIsProjecting,
    setIsLowerThirdProjecting,
    transitionType,
    transitionDurationMs,
    manualBlend,
    programTransitionMode
  } = useAppStore();
  const showPreview = viewMode === "studio";

  const previewCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const programContainerRef = useRef<HTMLDivElement>(null);
  const sourceMediaRef = useRef<Map<string, SourceMedia>>(new Map());
  const browserFramesRef = useRef<Map<string, HTMLImageElement>>(new Map());
  const browserSizeRef = useRef<Map<string, { width: number; height: number; url: string }>>(new Map());
  const [previewSize, setPreviewSize] = useState({ width: 1, height: 1 });
  const [isMultiviewOpen, setIsMultiviewOpen] = useState(false);
  const [mediaRevision, setMediaRevision] = useState(0);
  const [microphoneRevision, setMicrophoneRevision] = useState(0);
  const [transitionSources, setTransitionSources] = useState<Record<string, Source>>({});
  const [guides, setGuides] = useState<{ vertical: number[]; horizontal: number[] }>({ vertical: [], horizontal: [] });
  const transitionRef = useRef<{
    type: "fade" | "crossfade";
    startAt: number;
    duration: number;
    fromScene: Scene | null;
    fromSources: Record<string, Source>;
    toScene: Scene | null;
    toSources: Record<string, Source>;
  } | null>(null);
  const previousProgramRef = useRef<{ scene: Scene | null; sources: Record<string, Source> } | null>(null);
  const lowerThirdImageRef = useRef<HTMLImageElement | null>(null);
  const bibleImageRef = useRef<HTMLImageElement | null>(null);
  const lowerThirdBackgroundImageRef = useRef<HTMLImageElement | null>(null);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const programAudioMonitorGainRef = useRef<GainNode | null>(null);
  const previewLowerThirdCueRef = useRef<{ previous: LowerThirdSlide | null; current: LowerThirdSlide | null; changedAt: number }>({ previous: null, current: null, changedAt: performance.now() });
  const programLowerThirdCueRef = useRef<{ previous: LowerThirdSlide | null; current: LowerThirdSlide | null; changedAt: number }>({ previous: null, current: null, changedAt: performance.now() });

  const programScene = programSceneSnapshot;
  const previewScene = useMemo(() => scenes.find((scene) => scene.id === previewSceneId) ?? null, [previewSceneId, scenes]);
  const allSources = useMemo(
    () => ({ ...sources, ...transitionSources, ...programSources }),
    [programSources, sources, transitionSources]
  );
  const previewSceneLocked = Boolean(previewScene?.locked);
  const activeSourceIds = useMemo(
    () => {
      const ids = collectActiveSourceIds(isMultiviewOpen, scenes, programScene, showPreview || manualBlend > 0 ? previewScene : null, allSources);
      Object.values(transitionSources).forEach((source) => {
        if (source.enabled) {
          ids.add(source.id);
        }
      });
      Object.values(programSources).forEach((source) => {
        if (source.type === "audio" && source.audioScope === "persistent") {
          ids.delete(source.id);
        }
      });
      return ids;
    },
    [allSources, isMultiviewOpen, manualBlend, programScene, previewScene, programSources, scenes, showPreview, transitionSources]
  );

  const profile = getQualityProfile(settings.qualityPreset);
  const programSize = { width: profile.maxWidth, height: profile.maxHeight };
  const previewCanvasSize = fitToBounds(programSize.width, programSize.height, previewSize.width, previewSize.height);

  useEffect(() => {
    const previous = previousProgramRef.current;
    let cleanupTimer: number | null = null;
    if (previous?.scene && programScene && transitionType !== "cut" && programTransitionMode === "configured") {
      transitionRef.current = {
        type: transitionType === "fade" ? "fade" : "crossfade",
        startAt: performance.now(),
        duration: transitionDurationMs,
        fromScene: previous.scene,
        fromSources: previous.sources,
        toScene: programScene,
        toSources: programSources
      };
      setTransitionSources(previous.sources);
      cleanupTimer = window.setTimeout(
        () => setTransitionSources({}),
        Math.max(100, transitionDurationMs) + 100
      );
    } else {
      transitionRef.current = null;
      setTransitionSources({});
    }
    previousProgramRef.current = { scene: programScene, sources: programSources };
    return () => {
      if (cleanupTimer !== null) {
        window.clearTimeout(cleanupTimer);
      }
    };
  }, [programRevision]);

  useEffect(() => {
    if (manualBlend > 0) {
      transitionRef.current = null;
    }
  }, [manualBlend]);

  useEffect(() => {
    const next = settings.lowerThird.slides.find((slide) => slide.id === settings.lowerThird.activeSlideId) ?? null;
    const cue = previewLowerThirdCueRef.current;
    if (cue.current?.id !== next?.id) previewLowerThirdCueRef.current = { previous: cue.current, current: next, changedAt: performance.now() };
    else cue.current = next;
  }, [settings.lowerThird.activeSlideId, settings.lowerThird.slides]);

  useEffect(() => {
    const next = settings.lowerThird.slides.find((slide) => slide.id === settings.lowerThird.programSlideId) ?? null;
    const cue = programLowerThirdCueRef.current;
    if (cue.current?.id !== next?.id) programLowerThirdCueRef.current = { previous: cue.current, current: next, changedAt: performance.now() };
    else cue.current = next;
  }, [settings.lowerThird.programSlideId, settings.lowerThird.slides]);

  useEffect(() => {
    if (!settings.lowerThird.imageUrl) {
      lowerThirdImageRef.current = null;
      return;
    }
    const image = new Image();
    image.onload = () => { lowerThirdImageRef.current = image; };
    image.src = settings.lowerThird.imageUrl;
  }, [settings.lowerThird.imageUrl]);

  useEffect(() => {
    if (!settings.lowerThird.bibleImageUrl) {
      bibleImageRef.current = null;
      return;
    }
    const image = new Image();
    image.onload = () => { bibleImageRef.current = image; };
    image.src = settings.lowerThird.bibleImageUrl;
  }, [settings.lowerThird.bibleImageUrl]);

  useEffect(() => {
    if (!settings.lowerThird.backgroundImageUrl) {
      lowerThirdBackgroundImageRef.current = null;
      return;
    }
    const image = new Image();
    image.onload = () => { lowerThirdBackgroundImageRef.current = image; };
    image.src = settings.lowerThird.backgroundImageUrl;
  }, [settings.lowerThird.backgroundImageUrl]);

  useEffect(() => {
    const includeMicrophone = settings.audioMode === "microphone" || settings.audioMode === "both";
    if (!includeMicrophone) {
      stopMediaStream(microphoneStreamRef.current);
      microphoneStreamRef.current = null;
      setMicrophoneRevision((revision) => revision + 1);
      return;
    }

    let cancelled = false;
    const openMicrophone = async () => {
      try {
        const audio = settings.microphoneDeviceId
          ? { deviceId: { exact: settings.microphoneDeviceId } }
          : true;
        const stream = await navigator.mediaDevices.getUserMedia({ audio, video: false });
        if (cancelled) {
          stopMediaStream(stream);
          return;
        }
        stopMediaStream(microphoneStreamRef.current);
        microphoneStreamRef.current = stream;
        setMicrophoneRevision((revision) => revision + 1);
      } catch {
        if (!cancelled) {
          microphoneStreamRef.current = null;
          setMicrophoneRevision((revision) => revision + 1);
        }
      }
    };
    void openMicrophone();

    return () => {
      cancelled = true;
      stopMediaStream(microphoneStreamRef.current);
      microphoneStreamRef.current = null;
    };
  }, [settings.audioMode, settings.microphoneDeviceId]);

  useEffect(() => {
    const elements = [previewContainerRef.current, programContainerRef.current].filter((element): element is HTMLDivElement => Boolean(element));
    if (elements.length === 0) {
      return;
    }
    const resizeObserver = new ResizeObserver(() => {
      const element = elements
        .filter((candidate) => candidate.clientWidth > 0 && candidate.clientHeight > 0)
        .sort((a, b) => (b.clientWidth * b.clientHeight) - (a.clientWidth * a.clientHeight))[0];
      if (!element) return;
      const style = window.getComputedStyle(element);
      const horizontalPadding = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
      const verticalPadding = Number.parseFloat(style.paddingTop) + Number.parseFloat(style.paddingBottom);
      setPreviewSize({
        width: Math.max(1, element.clientWidth - horizontalPadding),
        height: Math.max(1, element.clientHeight - verticalPadding)
      });
    });
    elements.forEach((element) => resizeObserver.observe(element));
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

    const createMedia = async (source: Source) => {
      const signature = getSignature(source);
      const entry: SourceMedia = { signature, type: source.type };
      mediaMap.set(source.id, entry);

      if (source.type === "display" || source.type === "window") {
        const video = document.createElement("video");
        video.playsInline = true;
        video.muted = true;
        video.autoplay = true;
        try {
          let stream: MediaStream;
          try {
            stream = await getDisplayStream(source.data.captureId, source.audioEnabled, source.captureCursor ?? "never");
          } catch (error) {
            if (!source.audioEnabled) {
              throw error;
            }
            stream = await getDisplayStream(source.data.captureId, false, source.captureCursor ?? "never");
          }
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
          try {
            entry.captureStream = (
              video as HTMLVideoElement & { captureStream?: () => MediaStream }
            ).captureStream?.();
            setMediaRevision((revision) => revision + 1);
          } catch {
            // captureStream is optional.
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
        audio.addEventListener("loadedmetadata", () => {
          try {
            entry.captureStream = (
              audio as HTMLAudioElement & { captureStream?: () => MediaStream }
            ).captureStream?.();
            setMediaRevision((revision) => revision + 1);
          } catch {
            // captureStream is optional.
          }
        });
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

      if (mediaMap.get(source.id) !== entry) {
        cleanupSourceMedia(source.id, entry);
        return;
      }
      setMediaRevision((revision) => revision + 1);
    };

    activeSourceIds.forEach((id) => {
      const source = allSources[id];
      if (!source) {
        return;
      }
      const entry = mediaMap.get(id);
      const signature = getSignature(source);
      if (entry && entry.signature === signature) {
        return;
      }
      if (entry) {
        cleanupSourceMedia(id, entry);
        mediaMap.delete(id);
      }
      createMedia(source).catch(() => undefined);
    });

    Array.from(mediaMap.entries()).forEach(([id, entry]) => {
      if (!activeSourceIds.has(id)) {
        cleanupSourceMedia(id, entry);
        mediaMap.delete(id);
        browserFramesRef.current.delete(id);
        browserSizeRef.current.delete(id);
      }
    });
  }, [activeSourceIds, allSources, programSize.height, programSize.width]);

  useEffect(() => () => {
    sourceMediaRef.current.forEach((entry, sourceId) => cleanupSourceMedia(sourceId, entry));
    sourceMediaRef.current.clear();
  }, []);

  useEffect(() => {
    activeSourceIds.forEach((id) => {
      const source = allSources[id];
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
  }, [activeSourceIds, allSources]);

  useEffect(() => {
    const includeSceneAudio = settings.audioMode === "system" || settings.audioMode === "both";
    const includeMicrophone = settings.audioMode === "microphone" || settings.audioMode === "both";
    const sceneAudioSources = includeSceneAudio
      ? (programScene?.sourceIds ?? [])
          .map((id) => programSources[id])
          .filter((source): source is Source => Boolean(
            source &&
            source.audioScope !== "persistent" &&
            source.enabled &&
            source.audioEnabled &&
            supportsProgramAudio(source)
          ))
      : [];
    const persistentAudioSources = includeSceneAudio
      ? Object.values(sources).filter((source) =>
          source.audioScope === "persistent" &&
          source.enabled &&
          source.audioEnabled &&
          supportsProgramAudio(source)
        )
      : [];

    if (sceneAudioSources.length === 0 && persistentAudioSources.length === 0 && (!includeMicrophone || !microphoneStreamRef.current)) {
      publishAudioMeters({});
      setProgramAudioStream(null);
      return;
    }

    const audioContext = new AudioContext({ latencyHint: "interactive" });
    const destination = audioContext.createMediaStreamDestination();
    const masterGain = audioContext.createGain();
    masterGain.gain.value = clamp(settings.masterAudioGain ?? 1, 0, 2);
    masterGain.connect(destination);
    const monitorGain = createProgramAudioMonitor(
      audioContext,
      masterGain,
      isProgramAudioMonitoring,
      programAudioMonitorGain
    );
    programAudioMonitorGainRef.current = monitorGain;
    let connectedSources = 0;

    type MeterTap = {
      id: string;
      channels: 1 | 2;
      analysers: AnalyserNode[];
      buffers: Uint8Array<ArrayBuffer>[];
    };
    const meterTaps: MeterTap[] = [];
    const masterSplitter = audioContext.createChannelSplitter(2);
    const masterAnalysers = [audioContext.createAnalyser(), audioContext.createAnalyser()];
    masterAnalysers.forEach((analyser, channel) => {
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.55;
      masterSplitter.connect(analyser, channel);
    });
    masterGain.connect(masterSplitter);
    meterTaps.push({
      id: "master",
      channels: 2,
      analysers: masterAnalysers,
      buffers: masterAnalysers.map((analyser) => new Uint8Array(analyser.fftSize))
    });

    const connectStream = (stream: MediaStream | null | undefined, id: string, gainValue: number) => {
      if (!stream || stream.getAudioTracks().length === 0) {
        return;
      }
      try {
        const streamSource = audioContext.createMediaStreamSource(stream);
        const sourceGain = audioContext.createGain();
        sourceGain.gain.value = clamp(gainValue, 0, 2);
        streamSource.connect(sourceGain);
        sourceGain.connect(masterGain);

        const reportedChannels = stream.getAudioTracks()[0]?.getSettings().channelCount;
        const channels: 1 | 2 = reportedChannels === 1 || streamSource.channelCount === 1 ? 1 : 2;
        const analysers = Array.from({ length: channels }, () => {
          const analyser = audioContext.createAnalyser();
          analyser.fftSize = 256;
          analyser.smoothingTimeConstant = 0.55;
          return analyser;
        });
        if (channels === 1) {
          sourceGain.connect(analysers[0]);
        } else {
          const splitter = audioContext.createChannelSplitter(2);
          sourceGain.connect(splitter);
          splitter.connect(analysers[0], 0);
          splitter.connect(analysers[1], 1);
        }
        meterTaps.push({
          id,
          channels,
          analysers,
          buffers: analysers.map((analyser) => new Uint8Array(analyser.fftSize))
        });
        connectedSources += 1;
      } catch {
        // A stopped or restricted track must not break the remaining Program mix.
      }
    };

    [...sceneAudioSources, ...persistentAudioSources].forEach((source) => {
      const media = sourceMediaRef.current.get(source.id);
      const stream = source.type === "display" || source.type === "window"
        ? media?.stream
        : media?.captureStream;
      connectStream(stream, sourceMeterId(source.id), source.volume ?? 1);
    });

    if (includeMicrophone) {
      connectStream(microphoneStreamRef.current, "microphone", settings.microphoneGain ?? 1);
    }

    if (connectedSources === 0) {
      publishAudioMeters({});
      setProgramAudioStream(null);
      void audioContext.close();
      return;
    }

    void audioContext.resume();
    setProgramAudioStream(destination.stream);

    const publishLevels = () => {
      const next: AudioMeterSnapshot = {};
      meterTaps.forEach((tap) => {
        const readings = tap.analysers.map((analyser, index) => levelFromAnalyser(analyser, tap.buffers[index]));
        const left = readings[0]?.normalized ?? 0;
        const right = tap.channels === 2 ? readings[1]?.normalized ?? 0 : left;
        next[tap.id] = {
          left,
          right,
          channels: tap.channels,
          clipping: readings.some((reading) => reading.clipping)
        };
      });
      publishAudioMeters(next);
    };
    publishLevels();
    const meterTimer = window.setInterval(publishLevels, 80);

    return () => {
      window.clearInterval(meterTimer);
      publishAudioMeters({});
      setProgramAudioStream(null);
      if (programAudioMonitorGainRef.current === monitorGain) {
        programAudioMonitorGainRef.current = null;
      }
      audioContext.close().catch(() => undefined);
    };
  }, [
    mediaRevision,
    microphoneRevision,
    programScene,
    programSources,
    settings.audioMode,
    settings.masterAudioGain,
    settings.microphoneGain,
    setProgramAudioStream,
    sources
  ]);

  useEffect(() => {
    updateProgramAudioMonitor(
      programAudioMonitorGainRef.current,
      isProgramAudioMonitoring,
      programAudioMonitorGain
    );
  }, [isProgramAudioMonitoring, programAudioMonitorGain]);

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
    const crop = source.crop ?? { top: 0, right: 0, bottom: 0, left: 0 };
    const intrinsicWidth = drawable instanceof HTMLVideoElement
      ? drawable.videoWidth
      : drawable instanceof HTMLImageElement
        ? drawable.naturalWidth
        : 0;
    const intrinsicHeight = drawable instanceof HTMLVideoElement
      ? drawable.videoHeight
      : drawable instanceof HTMLImageElement
        ? drawable.naturalHeight
        : 0;
    if (intrinsicWidth > 0 && intrinsicHeight > 0) {
      const left = clamp(crop.left, 0, 95);
      const right = clamp(crop.right, 0, 95 - left);
      const top = clamp(crop.top, 0, 95);
      const bottom = clamp(crop.bottom, 0, 95 - top);
      const sourceX = intrinsicWidth * (left / 100);
      const sourceY = intrinsicHeight * (top / 100);
      const sourceWidth = intrinsicWidth * ((100 - left - right) / 100);
      const sourceHeight = intrinsicHeight * ((100 - top - bottom) / 100);
      ctx.drawImage(drawable, sourceX, sourceY, sourceWidth, sourceHeight, -width / 2, -height / 2, width, height);
    } else {
      ctx.drawImage(drawable, -width / 2, -height / 2, width, height);
    }
    ctx.restore();
  };

  const drawScene = (
    ctx: CanvasRenderingContext2D,
    scene: Scene | null,
    sourceMap: Record<string, Source>,
    canvasWidth: number,
    canvasHeight: number,
    configuredSlideId: string | null = null
  ) => {
    if (!scene) {
      return;
    }
    const visiblePresentationIds = visiblePresentationSourceIds(
      scene,
      sourceMap,
      settings.lowerThird.allowMultipleTextLayers,
      Boolean(configuredSlideId)
    );
    scene.sourceIds.forEach((id) => {
      const source = sourceMap[id];
      if (!source) {
        return;
      }
      if (isPresentationTextSource(source) && visiblePresentationIds && !visiblePresentationIds.has(id)) return;
      drawSource(ctx, source, canvasWidth, canvasHeight);
    });
  };

  const drawConfiguredLowerThird = (
    ctx: CanvasRenderingContext2D,
    canvasWidth: number,
    canvasHeight: number,
    now: number,
    cueRef: React.MutableRefObject<{ previous: LowerThirdSlide | null; current: LowerThirdSlide | null; changedAt: number }>
  ) => {
    const config = settings.lowerThird;
    const cue = cueRef.current;
    if (!cue.current && !cue.previous) return;
    const duration = Math.max(100, config.animationDurationMs);
    const progress = Math.min(1, Math.max(0, (now - cue.changedAt) / duration));
    const areaHeight = canvasHeight * (config.heightPercent / 100);
    const areaY = config.position === "top" ? 0 : canvasHeight - areaHeight;

    const drawSlide = (slide: LowerThirdSlide, animation: LowerThirdAnimation, phase: "enter" | "exit", amount: number) => {
      const visible = phase === "enter" ? amount : 1 - amount;
      ctx.save();
      if (animation === "fade") ctx.globalAlpha = visible;
      if (animation === "slide-left") ctx.translate((phase === "enter" ? 1 - amount : -amount) * canvasWidth, 0);
      if (animation === "slide-right") ctx.translate((phase === "enter" ? amount - 1 : amount) * canvasWidth, 0);
      if (animation === "slide-up") ctx.translate(0, (phase === "enter" ? 1 - amount : -amount) * areaHeight);
      if (animation === "zoom") {
        const scale = phase === "enter" ? 0.72 + amount * 0.28 : 1 - amount * 0.28;
        ctx.translate(canvasWidth / 2, areaY + areaHeight / 2);
        ctx.scale(scale, scale);
        ctx.translate(-canvasWidth / 2, -(areaY + areaHeight / 2));
        ctx.globalAlpha = visible;
      }
      if (animation === "wipe") {
        const width = canvasWidth * visible;
        ctx.beginPath();
        ctx.rect(phase === "enter" ? 0 : canvasWidth - width, areaY, width, areaHeight);
        ctx.clip();
      }

      ctx.save();
      ctx.globalAlpha *= clamp(config.backgroundOpacity, 0, 1);
      ctx.fillStyle = config.backgroundColor;
      ctx.fillRect(0, areaY, canvasWidth, areaHeight);
      ctx.restore();
      const backgroundImage = lowerThirdBackgroundImageRef.current;
      if (backgroundImage) {
        ctx.save();
        ctx.globalAlpha *= clamp(config.backgroundImageOpacity, 0, 1);
        ctx.drawImage(backgroundImage, 0, areaY, canvasWidth, areaHeight);
        ctx.restore();
      }
      const useBibleBranding = slide.kind === "scripture" && Boolean(config.bibleImageUrl);
      const image = useBibleBranding ? bibleImageRef.current : lowerThirdImageRef.current;
      const imagePosition = useBibleBranding ? config.bibleImagePosition : config.imagePosition;
      let textLeft = canvasWidth * 0.055;
      let textRight = canvasWidth * 0.945;
      if (image) {
        if (imagePosition === "background") {
          ctx.save();
          ctx.globalAlpha *= 0.25;
          ctx.drawImage(image, 0, areaY, canvasWidth, areaHeight);
          ctx.restore();
        } else {
          const imageSize = Math.min(areaHeight * 0.72, canvasWidth * 0.16);
          const imageX = imagePosition === "left" ? canvasWidth * 0.035 : canvasWidth * 0.965 - imageSize;
          ctx.drawImage(image, imageX, areaY + (areaHeight - imageSize) / 2, imageSize, imageSize);
          if (imagePosition === "left") textLeft = imageX + imageSize + canvasWidth * 0.025;
          else textRight = imageX - canvasWidth * 0.025;
        }
      }

      const availableWidth = Math.max(100, textRight - textLeft);
      const wordsToLines = (fontSize: number) => {
        const fontStyle = `${config.italic ? "italic " : ""}${config.bold ? "700 " : "400 "}${fontSize}px ${config.fontFamily}`;
        ctx.font = fontStyle;
        const lines: string[] = [];
        slide.text.split(/\r?\n/).forEach((paragraph) => {
          let current = "";
          paragraph.split(/\s+/).filter(Boolean).forEach((word) => {
            const candidate = current ? `${current} ${word}` : word;
            if (current && ctx.measureText(candidate).width > availableWidth) {
              lines.push(current);
              current = word;
            } else current = candidate;
          });
          if (current) lines.push(current);
        });
        return lines;
      };
      let fontSize = config.fontSize;
      let lines = wordsToLines(fontSize);
      const referenceLines = slide.reference ? 1 : 0;
      while (config.maxLines === 0 && fontSize > 16 && (lines.length + referenceLines) * fontSize * 1.18 > areaHeight * 0.78) {
        fontSize -= 2;
        lines = wordsToLines(fontSize);
      }
      if (config.maxLines > 0 && lines.length > config.maxLines) {
        lines = lines.slice(0, config.maxLines);
        lines[lines.length - 1] = `${lines[lines.length - 1].replace(/[.…]+$/, "")}...`;
      }
      const lineHeight = fontSize * 1.18;
      const referenceHeight = slide.reference ? fontSize * 0.72 : 0;
      const totalHeight = lines.length * lineHeight + referenceHeight;
      const startY = areaY + Math.max(fontSize * 0.22, (areaHeight - totalHeight) / 2);
      ctx.fillStyle = config.textColor;
      ctx.textBaseline = "top";
      ctx.textAlign = config.textAlign;
      const textX = config.textAlign === "left" ? textLeft : config.textAlign === "right" ? textRight : (textLeft + textRight) / 2;
      ctx.font = `${config.italic ? "italic " : ""}${config.bold ? "700 " : "400 "}${fontSize}px ${config.fontFamily}`;
      lines.forEach((line, index) => {
        ctx.fillText(line, textX, startY + index * lineHeight, availableWidth);
        if (config.underline) {
          const metrics = ctx.measureText(line);
          const underlineX = config.textAlign === "center" ? textX - metrics.width / 2 : config.textAlign === "right" ? textX - metrics.width : textX;
          ctx.fillRect(underlineX, startY + index * lineHeight + fontSize * 1.04, metrics.width, Math.max(2, fontSize / 24));
        }
      });
      if (slide.reference) {
        ctx.font = `600 ${Math.max(14, fontSize * 0.62)}px ${config.fontFamily}`;
        ctx.fillText(slide.reference, textX, startY + lines.length * lineHeight + fontSize * 0.08, availableWidth);
      }
      ctx.restore();
    };

    if (cue.previous && progress < 1) drawSlide(cue.previous, config.exitAnimation, "exit", progress);
    if (cue.current) drawSlide(cue.current, config.entranceAnimation, "enter", progress);
    if (progress >= 1) cue.previous = null;
  };

  const syncBrowserSources = (
    scene: Scene | null,
    sourceMap: Record<string, Source>,
    canvasWidth: number,
    canvasHeight: number
  ) => {
    if (!scene) {
      return;
    }
    scene.sourceIds.forEach((id) => {
      const source = sourceMap[id];
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
        drawScene(ctx, scene, sources, canvas.width, canvas.height);
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
    if (!showPreview) {
      return;
    }
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
    let lastRenderedAt = 0;
    const frameInterval = 1000 / Math.min(30, settings.frameRate);

    const render = (now: number) => {
      if (now - lastRenderedAt >= frameInterval) {
        lastRenderedAt = now;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        drawScene(ctx, previewScene, sources, canvas.width, canvas.height, settings.lowerThird.activeSlideId);
        if (settings.lowerThird.activeSlideId) {
          drawConfiguredLowerThird(ctx, canvas.width, canvas.height, performance.now(), previewLowerThirdCueRef);
        }
      }

      rafId = requestAnimationFrame(render);
    };

    rafId = requestAnimationFrame(render);
    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [previewScene, programSize.height, programSize.width, settings.frameRate, settings.lowerThird, showPreview, sources]);

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
    let lastRenderedAt = 0;
    const frameInterval = 1000 / settings.frameRate;

    const render = (now: number) => {
      if (now - lastRenderedAt < frameInterval) {
        if (!isFrozen) {
          rafId = requestAnimationFrame(render);
        }
        return;
      }
      lastRenderedAt = now;
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (!isCutToBlack) {
        const transition = transitionRef.current;
        if (manualBlend > 0 && previewScene) {
          ctx.save();
          ctx.globalAlpha = 1 - manualBlend;
          drawScene(ctx, programScene, programSources, canvas.width, canvas.height, settings.lowerThird.programSlideId);
          ctx.globalAlpha = manualBlend;
          drawScene(ctx, previewScene, sources, canvas.width, canvas.height, settings.lowerThird.activeSlideId);
          ctx.restore();
          syncBrowserSources(programScene, programSources, canvas.width, canvas.height);
          syncBrowserSources(previewScene, sources, canvas.width, canvas.height);
        } else if (
          transition &&
          transition.fromScene &&
          transition.toScene &&
          performance.now() - transition.startAt < transition.duration
        ) {
          const elapsed = performance.now() - transition.startAt;
          const progress = Math.min(1, elapsed / transition.duration);
          const fromScene = transition.fromScene;
          const toScene = transition.toScene;

          if (transition.type === "crossfade") {
            ctx.save();
            ctx.globalAlpha = 1 - progress;
            drawScene(ctx, fromScene, transition.fromSources, canvas.width, canvas.height, settings.lowerThird.programSlideId);
            ctx.globalAlpha = progress;
            drawScene(ctx, toScene, transition.toSources, canvas.width, canvas.height, settings.lowerThird.programSlideId);
            ctx.restore();
          } else {
            if (progress < 0.5) {
              ctx.save();
              ctx.globalAlpha = 1 - progress * 2;
              drawScene(ctx, fromScene, transition.fromSources, canvas.width, canvas.height, settings.lowerThird.programSlideId);
              ctx.restore();
            } else {
              ctx.save();
              ctx.globalAlpha = (progress - 0.5) * 2;
              drawScene(ctx, toScene, transition.toSources, canvas.width, canvas.height, settings.lowerThird.programSlideId);
              ctx.restore();
            }
          }

          syncBrowserSources(toScene, transition.toSources, canvas.width, canvas.height);
        } else {
          if (transition) {
            transitionRef.current = null;
          }
          drawScene(ctx, programScene, programSources, canvas.width, canvas.height, settings.lowerThird.programSlideId);
          syncBrowserSources(programScene, programSources, canvas.width, canvas.height);
        }
      }
      if (!isCutToBlack && settings.lowerThird.showOnProgram && settings.lowerThird.programSlideId) {
        drawConfiguredLowerThird(ctx, canvas.width, canvas.height, performance.now(), programLowerThirdCueRef);
      }

      if (!isFrozen) {
        rafId = requestAnimationFrame(render);
      }
    };

    rafId = requestAnimationFrame(render);

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
    };
  }, [
    programScene,
    programSources,
    isCutToBlack,
    isFrozen,
    manualBlend,
    previewScene,
    programCanvasRef,
    programTransitionMode,
    programSize.height,
    programSize.width,
    settings.frameRate,
    settings.lowerThird,
    sources
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
    if (isFrozen) {
      return;
    }
    const interval = window.setInterval(sendFrame, 1000 / Math.min(30, settings.frameRate));

    return () => {
      window.clearInterval(interval);
    };
  }, [isFrozen, isProjecting, programCanvasRef, settings.frameRate, settings.networkOutput.enabled]);

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
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (!isCutToBlack && programScene) {
        const visiblePresentationIds = visiblePresentationSourceIds(
          programScene,
          programSources,
          settings.lowerThird.allowMultipleTextLayers,
          Boolean(settings.lowerThird.programSlideId)
        );
        programScene.sourceIds.forEach((id) => {
          const source = programSources[id];
          if (
            source?.type === "text"
            && source.data.role === "lower-third"
            && (!visiblePresentationIds || visiblePresentationIds.has(id))
          ) {
            drawSource(ctx, source, canvas.width, canvas.height);
          }
        });
      }
      if (!isCutToBlack && settings.lowerThird.programSlideId) {
        drawConfiguredLowerThird(ctx, canvas.width, canvas.height, performance.now(), programLowerThirdCueRef);
      }
      window.dualcast.sendLowerThirdFrame(canvas.toDataURL("image/webp", 0.9));
    };

    sendLowerThirdFrame();
    const interval = window.setInterval(sendLowerThirdFrame, 1000 / 15);
    const stopAnimation = window.setTimeout(
      () => window.clearInterval(interval),
      Math.max(100, settings.lowerThird.animationDurationMs) + 100
    );
    return () => {
      window.clearInterval(interval);
      window.clearTimeout(stopAnimation);
    };
  }, [
    isCutToBlack,
    isLowerThirdProjecting,
    programScene,
    programSize.height,
    programSize.width,
    settings.lowerThird,
    programSources
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
      <div className="pane preview-pane">
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
                          onDoubleClick={(event) => {
                            if (source.type === "text") {
                              event.stopPropagation();
                              takeToProgram();
                            }
                          }}
                          title={source.type === "text" ? "Double-click to send this text and scene to Program" : undefined}
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
      <div className="pane program-pane">
        <div className="pane-header program-header">
          <h2>Program</h2>
          <span className={isCutToBlack ? "tag alert" : "tag"}>{isCutToBlack ? "BLACK" : "LIVE"}</span>
        </div>
        <div className="pane-body program-body" ref={programContainerRef}>
          <div className="canvas-stage" style={{ width: previewCanvasSize.width, height: previewCanvasSize.height }}>
            <canvas ref={programCanvasRef} className="video-surface" />
          </div>
        </div>
      </div>
    </section>
  );
};

export default PreviewProgram;

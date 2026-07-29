import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { pickRecorderMimeType, stopMediaStream } from "../utils/media";
import { AudioMode, StreamDestinationInput, StreamStatusPayload, StreamingStatus } from "../../shared/types";

const presetBitrateMap: Record<string, number> = {
  low: 2_500_000,
  medium: 4_500_000,
  high: 6_500_000
};

const shouldIncludeSystem = (mode: AudioMode) => mode === "system" || mode === "both";
const shouldIncludeMic = (mode: AudioMode) => mode === "microphone" || mode === "both";

const formatTimer = (seconds: number) => {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
};

const isValidRtmpUrl = (rtmpUrl: string) => {
  try {
    const parsed = new URL(rtmpUrl);
    return parsed.protocol === "rtmp:" || parsed.protocol === "rtmps:";
  } catch {
    return false;
  }
};

export const useProgramStreamer = (canvasRef: React.RefObject<HTMLCanvasElement>) => {
  const { programSceneId, scenes, settings, programAudioStream } = useAppStore();
  const [status, setStatus] = useState<StreamingStatus>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [formattedElapsed, setFormattedElapsed] = useState("00:00");
  const [stats, setStats] = useState<{ fps?: number | null; bitrateKbps?: number | null; time?: string | null; droppedFrames?: number | null } | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [destinationStatuses, setDestinationStatuses] = useState<
    NonNullable<StreamStatusPayload["destinationStatuses"]>
  >([]);
  const startedAtRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);
  const canvasStreamRef = useRef<MediaStream | null>(null);
  const stopRequestedRef = useRef(false);
  const startInFlightRef = useRef(false);

  const clearTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const cleanupCapture = () => {
    stopMediaStream(canvasStreamRef.current);
    stopMediaStream(micStreamRef.current);
    canvasStreamRef.current = null;
    micStreamRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;
  };

  useEffect(() => {
    const unsubscribe = window.dualcast.onStreamStatus((payload) => {
      setStatus(payload.status);
      setStatusMessage(payload.message ?? null);
      startedAtRef.current = payload.startedAt ?? null;
      setStats(payload.stats ?? null);
      setLastError(payload.lastError ?? null);
      setDestinationStatuses(payload.destinationStatuses ?? []);
    });
    return () => {
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    clearTimer();
    if (status !== "live" || !startedAtRef.current) {
      setElapsedSeconds(0);
      setFormattedElapsed("00:00");
      return;
    }

    const updateElapsed = () => {
      const seconds = Math.max(0, Math.floor((Date.now() - (startedAtRef.current ?? Date.now())) / 1000));
      setElapsedSeconds(seconds);
      setFormattedElapsed(formatTimer(seconds));
    };

    updateElapsed();
    timerRef.current = window.setInterval(updateElapsed, 1000);
    return () => {
      clearTimer();
    };
  }, [status]);

  useEffect(() => {
    if ((status === "idle" || status === "error") && recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }, [status]);

  const startStream = useCallback(
    async (destinations: StreamDestinationInput[]) => {
      if (startInFlightRef.current) {
        return { ok: false, message: "Stream is already starting." };
      }
      if (!canvasRef.current) {
        return { ok: false, message: "Program output is not ready." };
      }
      const programScene = scenes.find((scene) => scene.id === programSceneId) ?? null;
      if (!programSceneId || !programScene || programScene.sourceIds.length === 0) {
        return { ok: false, message: "Select a scene and TAKE it to Program before streaming." };
      }
      if (recorderRef.current) {
        return { ok: false, message: "Stream is already active." };
      }
      const enabledDestinations = destinations.filter((destination) => destination.enabled);
      if (enabledDestinations.length === 0) {
        return { ok: false, message: "Enable at least one stream destination." };
      }
      const invalidDestination = enabledDestinations.find(
        (destination) => !destination.streamKey || !isValidRtmpUrl(destination.rtmpUrl)
      );
      if (invalidDestination) {
        return {
          ok: false,
          message: `Check the RTMP URL and stream key for ${invalidDestination.name}.`
        };
      }

      startInFlightRef.current = true;
      setStatusMessage(null);
      setElapsedSeconds(0);

      const canvasStream = canvasRef.current.captureStream(settings.streamFps);
      canvasStreamRef.current = canvasStream;
      const tracks = [...canvasStream.getVideoTracks()];

      const audioMode = settings.audioMode;
      const includeProgramAudio = shouldIncludeSystem(audioMode);
      const captureAudio = includeProgramAudio || shouldIncludeMic(audioMode);
      const audioContext = captureAudio ? new AudioContext() : null;
      const destination = audioContext ? audioContext.createMediaStreamDestination() : null;
      audioContextRef.current = audioContext;

      if (includeProgramAudio && programAudioStream && audioContext && destination && programAudioStream.getAudioTracks().length > 0) {
        try {
          const source = audioContext.createMediaStreamSource(programAudioStream);
          source.connect(destination);
        } catch {
          setStatusMessage("Program audio is unavailable for this scene.");
        }
      }

      if (shouldIncludeMic(audioMode)) {
        try {
          const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          micStreamRef.current = micStream;
          if (audioContext && destination && micStream.getAudioTracks().length > 0) {
            const source = audioContext.createMediaStreamSource(micStream);
            source.connect(destination);
          }
        } catch (error) {
          setStatusMessage("Microphone access was denied or unavailable.");
        }
      }

      if (destination) {
        tracks.push(...destination.stream.getAudioTracks());
      }

      const outputStream = new MediaStream(tracks);
      const hasAudio = outputStream.getAudioTracks().length > 0;

      const startResult = await window.dualcast.startStream({
        destinations: enabledDestinations,
        hasAudio,
        preset: settings.streamPreset,
        fps: settings.streamFps,
        audioBitrate: settings.streamAudioBitrate,
        encoder: settings.streamEncoder
      });

      if (!startResult.ok) {
        cleanupCapture();
        startInFlightRef.current = false;
        setStatusMessage(startResult.message ?? "Failed to start stream.");
        return startResult;
      }

      try {
        const mimeType = pickRecorderMimeType();
        const bitrate = presetBitrateMap[settings.streamPreset] ?? presetBitrateMap.medium;
        const recorder = new MediaRecorder(outputStream, {
          mimeType: mimeType || undefined,
          videoBitsPerSecond: bitrate
        });

        recorderRef.current = recorder;
        stopRequestedRef.current = false;

        recorder.ondataavailable = (event) => {
          if (!event.data || event.data.size === 0) {
            return;
          }
          event.data
            .arrayBuffer()
            .then((buffer) => window.dualcast.sendStreamChunk(new Uint8Array(buffer)))
            .catch(() => undefined);
        };

        recorder.onstop = () => {
          cleanupCapture();
          recorderRef.current = null;
          startInFlightRef.current = false;
          if (stopRequestedRef.current) {
            window.dualcast.stopStream().catch(() => undefined);
          }
          stopRequestedRef.current = false;
        };

        recorder.start(1000);
        startInFlightRef.current = false;
        return { ok: true };
      } catch {
        cleanupCapture();
        startInFlightRef.current = false;
        setStatusMessage("Unable to start streaming capture.");
        return { ok: false, message: "Unable to start streaming capture." };
      }
    },
    [
      canvasRef,
      programSceneId,
      scenes,
      programAudioStream,
      settings.audioMode,
      settings.streamFps,
      settings.streamPreset,
      settings.streamAudioBitrate,
      settings.streamEncoder
    ]
  );

  const stopStream = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      stopRequestedRef.current = true;
      recorderRef.current.stop();
      return;
    }
    stopRequestedRef.current = true;
    void window.dualcast.stopStream();
  }, []);

  return {
    status,
    statusMessage,
    elapsedSeconds,
    formattedElapsed,
    stats,
    lastError,
    destinationStatuses,
    startStream,
    stopStream
  };
};

import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { pickStreamingRecorderMimeType, stopMediaStream } from "../utils/media";
import { StreamDestinationInput, StreamStatusPayload, StreamingStatus } from "../../shared/types";
import { isValidRtmpUrl } from "../../shared/streamingValidation";
import { formatElapsedTimer } from "../utils/time";

const presetBitrateMap: Record<string, number> = {
  low: 2_500_000,
  medium: 4_500_000,
  high: 6_500_000
};

export const useProgramStreamer = (canvasRef: React.RefObject<HTMLCanvasElement>) => {
  const { programSceneId, programSceneSnapshot, settings, programAudioStream } = useAppStore();
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
  const canvasStreamRef = useRef<MediaStream | null>(null);
  const stopRequestedRef = useRef(false);
  const startInFlightRef = useRef(false);
  const chunkQueueRef = useRef<Promise<void>>(Promise.resolve());

  const clearTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const cleanupCapture = () => {
    stopMediaStream(canvasStreamRef.current);
    canvasStreamRef.current = null;
    audioContextRef.current?.close().catch(() => undefined);
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
      setFormattedElapsed(formatElapsedTimer(seconds));
    };

    updateElapsed();
    timerRef.current = window.setInterval(updateElapsed, 1000);
    return () => {
      clearTimer();
    };
  }, [status]);

  useEffect(() => {
    if ((status === "idle" || status === "error") && recorderRef.current && recorderRef.current.state !== "inactive") {
      stopRequestedRef.current = true;
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
      if (!programSceneId || !programSceneSnapshot?.sourceIds.length) {
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

      const captureAudio = settings.audioMode !== "none" && Boolean(programAudioStream?.getAudioTracks().length);
      const audioContext = captureAudio ? new AudioContext() : null;
      const destination = audioContext ? audioContext.createMediaStreamDestination() : null;
      audioContextRef.current = audioContext;

      if (programAudioStream && audioContext && destination && programAudioStream.getAudioTracks().length > 0) {
        try {
          const source = audioContext.createMediaStreamSource(programAudioStream);
          source.connect(destination);
        } catch {
          setStatusMessage("Program audio is unavailable for this scene.");
        }
      }

      if (destination) {
        tracks.push(...destination.stream.getAudioTracks());
      }

      const outputStream = new MediaStream(tracks);
      const hasAudio = outputStream.getAudioTracks().length > 0;

      let startResult;
      try {
        startResult = await window.dualcast.startStream({
          destinations: enabledDestinations,
          hasAudio,
          preset: settings.streamPreset,
          fps: settings.streamFps,
          audioBitrate: settings.streamAudioBitrate,
          encoder: settings.streamEncoder
        });
      } catch (error) {
        cleanupCapture();
        startInFlightRef.current = false;
        const message = error instanceof Error ? error.message : "Failed to start stream.";
        setStatusMessage(message);
        return { ok: false, message };
      }

      if (!startResult.ok) {
        cleanupCapture();
        startInFlightRef.current = false;
        setStatusMessage(startResult.message ?? "Failed to start stream.");
        return startResult;
      }

      try {
        const mimeType = pickStreamingRecorderMimeType();
        const bitrate = presetBitrateMap[settings.streamPreset] ?? presetBitrateMap.medium;
        const recorder = new MediaRecorder(outputStream, {
          mimeType: mimeType || undefined,
          videoBitsPerSecond: bitrate
        });

        recorderRef.current = recorder;
        stopRequestedRef.current = false;
        chunkQueueRef.current = Promise.resolve();

        recorder.ondataavailable = (event) => {
          if (!event.data || event.data.size === 0) {
            return;
          }
          chunkQueueRef.current = chunkQueueRef.current
            .then(() => event.data.arrayBuffer())
            .then((buffer) => window.dualcast.sendStreamChunk(new Uint8Array(buffer)))
            .then(() => undefined)
            .catch((error) => {
              const message = error instanceof Error ? error.message : "Stream data delivery failed.";
              setLastError(message);
              setStatusMessage(message);
              stopRequestedRef.current = true;
              if (recorder.state !== "inactive") recorder.stop();
            });
        };

        recorder.onstop = async () => {
          cleanupCapture();
          recorderRef.current = null;
          startInFlightRef.current = false;
          await chunkQueueRef.current;
          if (stopRequestedRef.current) {
            await window.dualcast.stopStream().catch(() => undefined);
          }
          stopRequestedRef.current = false;
        };

        recorder.start(1000);
        startInFlightRef.current = false;
        return { ok: true };
      } catch {
        cleanupCapture();
        recorderRef.current = null;
        startInFlightRef.current = false;
        await window.dualcast.stopStream().catch(() => undefined);
        setStatusMessage("Unable to start streaming capture.");
        return { ok: false, message: "Unable to start streaming capture." };
      }
    },
    [
      canvasRef,
      programSceneId,
      programSceneSnapshot,
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
    void window.dualcast.stopStream().catch((error) => {
      const message = error instanceof Error ? error.message : "Unable to stop the stream.";
      setLastError(message);
      setStatusMessage(message);
    });
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

export type ProgramStreamerController = ReturnType<typeof useProgramStreamer>;

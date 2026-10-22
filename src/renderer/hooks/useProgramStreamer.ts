import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { useShallow } from "zustand/react/shallow";
import { pickStreamingRecorderMimeType, stopMediaStream } from "../utils/media";
import { StreamDestinationInput, StreamStatusPayload, StreamingStatus } from "../../shared/types";
import { isValidRtmpUrl } from "../../shared/streamingValidation";
import { formatElapsedTimer } from "../utils/time";
import { createStreamingCapture } from "../utils/streamingCapture";
import { streamingProfile } from "../../shared/streamingProfile";
import { supports8KEncoding } from "./use8KSupport";

export const useProgramStreamer = (canvasRef: React.RefObject<HTMLCanvasElement>) => {
  const { programSceneId, programSceneSnapshot, settings, programAudioStream } = useAppStore(useShallow(state => ({
    programSceneId: state.programSceneId, programSceneSnapshot: state.programSceneSnapshot, settings: state.settings, programAudioStream: state.programAudioStream
  })));
  const [status, setStatus] = useState<StreamingStatus>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [formattedElapsed, setFormattedElapsed] = useState("00:00");
  const [stats, setStats] = useState<StreamStatusPayload["stats"]>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [destinationStatuses, setDestinationStatuses] = useState<
    NonNullable<StreamStatusPayload["destinationStatuses"]>
  >([]);
  const startedAtRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const canvasStreamRef = useRef<MediaStream | null>(null);
  const stopCaptureRef = useRef<(() => void) | null>(null);
  const stopRequestedRef = useRef(false);
  const startInFlightRef = useRef(false);
  const chunkQueueRef = useRef<Promise<void>>(Promise.resolve());
  const captureErrorRef = useRef<string | null>(null);
  const recovery = useRef({ active: false, pending: false, attempts: 0, lastAt: 0, timer: 0, notice: "" });
  const recoveryDestinations = useRef<StreamDestinationInput[]>([]);
  const startAgain = useRef<(destinations: StreamDestinationInput[]) => Promise<{ ok: boolean; message?: string }>>(async () => ({ ok: false }));
  const streamBegan = useRef<number | null>(null);

  const scheduleRetry = () => {
    if (!recovery.current.active) return;
    window.clearTimeout(recovery.current.timer);
    const delay = Math.min(15000, 750 * 2 ** Math.min(5, recovery.current.attempts - 1));
    recovery.current.timer = window.setTimeout(() => {
      if (!recovery.current.active) return;
      recovery.current.pending = false;
      void startAgain.current(recoveryDestinations.current).then(result => {
        if (!result.ok && recovery.current.active) {
          recovery.current.active = false;
          captureErrorRef.current = result.message || "Streaming could not reconnect. Check the destination settings.";
          setLastError(captureErrorRef.current); setStatusMessage(captureErrorRef.current); setStatus("error");
        }
      });
    }, delay);
  };

  const requestRecovery = (reason: string) => {
    if (useAppStore.getState().settings.streamAutoRecover === false) return false;
    if (stopRequestedRef.current && !recovery.current.active) return false;
    if (recovery.current.pending) return true;
    if (Date.now() - recovery.current.lastAt > 30000) recovery.current.attempts = 0;
    recovery.current.attempts++; recovery.current.lastAt = Date.now();
    recovery.current.active = recovery.current.pending = true;
    recovery.current.notice = recovery.current.attempts >= 2 ? "Recovered using 720p, up to 30 fps and lower bandwidth." : "Stream reconnected with fresh video input.";
    captureErrorRef.current = null; setLastError(null); setStatus("reconnecting");
    setStatusMessage(`${reason} Reconnecting automatically…`);
    stopRequestedRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    else if (!recorder) {
      cleanupCapture(); startInFlightRef.current = false;
      void window.dualcast.stopStream().catch(() => undefined).then(scheduleRetry);
    }
    return true;
  };

  const clearTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const cleanupCapture = () => {
    stopCaptureRef.current?.();
    stopCaptureRef.current = null;
    stopMediaStream(canvasStreamRef.current);
    canvasStreamRef.current = null;
    audioContextRef.current?.close().catch(() => undefined);
    audioContextRef.current = null;
  };

  useEffect(() => {
    const unsubscribe = window.dualcast.onStreamStatus((payload) => {
      if (payload.restartRequired && requestRecovery(payload.message || "The stream input fell behind.")) return;
      const recovering = recovery.current.active;
      if (payload.status === "error") {
        recovery.current.active = recovery.current.pending = false;
        window.clearTimeout(recovery.current.timer);
      }
      if (payload.status === "live") { recovery.current.active = recovery.current.pending = false; streamBegan.current ??= payload.startedAt ?? Date.now(); }
      setStatus(captureErrorRef.current && payload.status === "idle" ? "error" : recovering && ["idle", "connecting"].includes(payload.status) ? "reconnecting" : payload.status);
      setStatusMessage(captureErrorRef.current ?? payload.message ?? (payload.status === "live" ? recovery.current.notice || null : null));
      startedAtRef.current = streamBegan.current ?? payload.startedAt ?? null;
      setStats(payload.stats ?? null);
      setLastError(captureErrorRef.current ?? payload.lastError ?? null);
      setDestinationStatuses(payload.destinationStatuses ?? []);
    });
    return () => {
      unsubscribe();
      recovery.current.active = recovery.current.pending = false;
      window.clearTimeout(recovery.current.timer);
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
      if (!recovery.current.active) { recovery.current.attempts = 0; recovery.current.notice = ""; streamBegan.current = null; }
      recoveryDestinations.current = enabledDestinations;
      stopRequestedRef.current = false;
      captureErrorRef.current = null;
      setLastError(null);
      if (!(recovery.current.active && recovery.current.attempts >= 2) && settings.streamResolution === "8k" && !(await supports8KEncoding(settings.streamFps))) {
        startInFlightRef.current = false;
        return { ok: false, message: "8K streaming requires a compatible hardware encoder. Choose a lower resolution." };
      }
      setStatusMessage(null);
      setElapsedSeconds(0);
      const profileSettings = recovery.current.active && recovery.current.attempts >= 2
        ? { ...settings, streamPreset: "low" as const, streamResolution: "720p" as const, streamFps: Math.min(30, settings.streamFps) as typeof settings.streamFps }
        : settings;
      const profile = streamingProfile(profileSettings.streamPreset, profileSettings.streamResolution, profileSettings.streamFps);
      const mimeType = pickStreamingRecorderMimeType(profile.width);

      let capture: ReturnType<typeof createStreamingCapture>;
      try {
        capture = createStreamingCapture(canvasRef.current, profileSettings.streamPreset, profileSettings.streamFps, profileSettings.streamResolution);
      } catch (error) {
        startInFlightRef.current = false;
        return { ok: false, message: error instanceof Error ? error.message : "Streaming capture failed." };
      }
      stopCaptureRef.current = capture.stop;
      const canvasStream = capture.stream;
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
          preset: profileSettings.streamPreset,
          resolution: profileSettings.streamResolution,
          fps: profileSettings.streamFps,
          audioBitrate: settings.streamAudioBitrate,
          encoder: settings.streamEncoder,
          inputVideoCodec: mimeType.includes("h264") ? "h264" : "other",
          copyVideo: settings.streamPassthrough !== false && mimeType.includes("h264"),
          autoRecover: settings.streamAutoRecover !== false
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
      if (stopRequestedRef.current) {
        cleanupCapture(); startInFlightRef.current = false;
        await window.dualcast.stopStream().catch(() => undefined);
        return { ok: false, message: "Streaming start was cancelled." };
      }

      try {
        const bitrate = profile.videoBitsPerSecond;
        const byteLimit = Math.max(4 * 1024 * 1024, bitrate / 8 * 1.5);
        const options: MediaRecorderOptions & { videoKeyFrameIntervalDuration: number } = {
          mimeType: mimeType || undefined,
          videoBitsPerSecond: bitrate,
          videoKeyFrameIntervalDuration: 2000
        };
        const recorder = new MediaRecorder(outputStream, options);

        recorderRef.current = recorder;
        chunkQueueRef.current = Promise.resolve();
        let pendingBytes = 0;
        let pendingChunks = 0;
        let deliveryFailed = false;

        recorder.ondataavailable = (event) => {
          if (deliveryFailed || !event.data || event.data.size === 0) {
            return;
          }
          // WebM chunks depend on prior chunks: never discard random chunks.
          // Stop with a useful error instead of accumulating minutes of delay.
          pendingBytes += event.data.size;
          pendingChunks += 1;
          if (pendingBytes > byteLimit || pendingChunks > 8) {
            deliveryFailed = true;
            const message = "Streaming cannot keep up. Choose a lower streaming quality or fewer destinations, then restart the stream.";
            if (requestRecovery("Streaming capture delivery fell behind.")) return;
            captureErrorRef.current = message;
            setLastError(message);
            setStatusMessage(message);
            stopRequestedRef.current = true;
            if (recorder.state !== "inactive") recorder.stop();
            return;
          }
          chunkQueueRef.current = chunkQueueRef.current
            .then(() => event.data.arrayBuffer())
            .then((buffer) => deliveryFailed ? undefined : window.dualcast.sendStreamChunk(new Uint8Array(buffer)))
            .then(() => undefined)
            .catch((error) => {
              deliveryFailed = true;
              const message = error instanceof Error ? error.message : "Stream data delivery failed.";
              if (requestRecovery(message)) return;
              captureErrorRef.current = message;
              setLastError(message);
              setStatusMessage(message);
              stopRequestedRef.current = true;
              if (recorder.state !== "inactive") recorder.stop();
            })
            .finally(() => { pendingBytes -= event.data.size; pendingChunks -= 1; });
        };

        recorder.onstop = async () => {
          if (!stopRequestedRef.current) {
            if (!requestRecovery("Streaming capture stopped unexpectedly.")) {
              captureErrorRef.current = "Streaming capture stopped unexpectedly. Check the selected encoder and restart the stream.";
              setLastError(captureErrorRef.current); setStatusMessage(captureErrorRef.current); setStatus("error");
            }
          }
          cleanupCapture();
          startInFlightRef.current = true;
          await chunkQueueRef.current;
          await window.dualcast.stopStream().catch(() => undefined);
          recorderRef.current = null;
          startInFlightRef.current = false;
          stopRequestedRef.current = false;
          if (recovery.current.active) scheduleRetry();
        };

        recorder.onerror = event => {
          const detail = (event as Event & { error?: Error }).error?.message;
          if (requestRecovery(detail || "The streaming capture encoder failed.")) return;
          captureErrorRef.current = `Streaming capture encoder failed${detail ? `: ${detail}` : ". Choose another encoder or a lower resolution."}`;
          setLastError(captureErrorRef.current); setStatusMessage(captureErrorRef.current); setStatus("error");
          stopRequestedRef.current = true;
          if (recorder.state !== "inactive") recorder.stop();
        };

        recorder.start(250);
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
      settings.streamResolution,
      settings.streamAudioBitrate,
      settings.streamEncoder,
      settings.streamPassthrough,
      settings.streamAutoRecover
    ]
  );
  startAgain.current = startStream;

  const stopStream = useCallback(() => {
    recovery.current.active = recovery.current.pending = false;
    recovery.current.notice = ""; window.clearTimeout(recovery.current.timer);
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

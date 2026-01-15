import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "../store/useAppStore";
import { getDisplayStream, pickRecorderMimeType, stopMediaStream } from "../utils/media";
import { AudioMode, StreamingStatus } from "../../shared/types";

const DEFAULT_VIDEO_BITRATE = 4_500_000;

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
  const { programSourceId, settings } = useAppStore();
  const [status, setStatus] = useState<StreamingStatus>("idle");
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [formattedElapsed, setFormattedElapsed] = useState("00:00");
  const startedAtRef = useRef<number | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const systemStreamRef = useRef<MediaStream | null>(null);
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
    stopMediaStream(systemStreamRef.current);
    stopMediaStream(micStreamRef.current);
    canvasStreamRef.current = null;
    systemStreamRef.current = null;
    micStreamRef.current = null;
    audioContextRef.current?.close();
    audioContextRef.current = null;
  };

  useEffect(() => {
    const unsubscribe = window.dualcast.onStreamStatus((payload) => {
      setStatus(payload.status);
      setStatusMessage(payload.message ?? null);
      startedAtRef.current = payload.startedAt ?? null;
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
    async (rtmpUrl: string, streamKey: string) => {
      if (startInFlightRef.current) {
        return { ok: false, message: "Stream is already starting." };
      }
      if (!canvasRef.current) {
        return { ok: false, message: "Program output is not ready." };
      }
      if (!programSourceId) {
        return { ok: false, message: "Select a display and TAKE it to Program before streaming." };
      }
      if (recorderRef.current) {
        return { ok: false, message: "Stream is already active." };
      }
      if (!rtmpUrl || !streamKey) {
        return { ok: false, message: "RTMP URL and stream key are required." };
      }
      if (!isValidRtmpUrl(rtmpUrl)) {
        return { ok: false, message: "Enter a valid RTMP URL (rtmp:// or rtmps://)." };
      }

      startInFlightRef.current = true;
      setStatusMessage(null);
      setElapsedSeconds(0);

      const canvasStream = canvasRef.current.captureStream(settings.frameRate);
      canvasStreamRef.current = canvasStream;
      const tracks = [...canvasStream.getVideoTracks()];

      const audioMode = settings.audioMode;
      const captureAudio = shouldIncludeSystem(audioMode) || shouldIncludeMic(audioMode);
      const audioContext = captureAudio ? new AudioContext() : null;
      const destination = audioContext ? audioContext.createMediaStreamDestination() : null;
      audioContextRef.current = audioContext;

      if (shouldIncludeSystem(audioMode)) {
        try {
          const systemStream = await getDisplayStream(programSourceId, true);
          systemStreamRef.current = systemStream;
          if (audioContext && destination && systemStream.getAudioTracks().length > 0) {
            const source = audioContext.createMediaStreamSource(systemStream);
            source.connect(destination);
          }
          systemStream.getVideoTracks().forEach((track) => track.stop());
        } catch (error) {
          setStatusMessage("System audio is unavailable for this display.");
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
        rtmpUrl,
        streamKey,
        hasAudio
      });

      if (!startResult.ok) {
        cleanupCapture();
        startInFlightRef.current = false;
        setStatusMessage(startResult.message ?? "Failed to start stream.");
        return startResult;
      }

      try {
        const mimeType = pickRecorderMimeType();
        const recorder = new MediaRecorder(outputStream, {
          mimeType: mimeType || undefined,
          videoBitsPerSecond: DEFAULT_VIDEO_BITRATE
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
    [canvasRef, programSourceId, settings.audioMode, settings.frameRate]
  );

  const stopStream = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      stopRequestedRef.current = true;
      recorderRef.current.stop();
    }
  }, []);

  return {
    status,
    statusMessage,
    elapsedSeconds,
    formattedElapsed,
    startStream,
    stopStream
  };
};

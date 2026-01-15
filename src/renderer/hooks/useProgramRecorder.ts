import { useCallback, useRef } from "react";
import { useAppStore } from "../store/useAppStore";
import { getDisplayStream, pickRecorderMimeType, stopMediaStream } from "../utils/media";
import { AudioMode } from "../../shared/types";
import { getQualityProfile } from "../../shared/recording";

const shouldIncludeSystem = (mode: AudioMode) => mode === "system" || mode === "both";
const shouldIncludeMic = (mode: AudioMode) => mode === "microphone" || mode === "both";

export const useProgramRecorder = (canvasRef: React.RefObject<HTMLCanvasElement>) => {
  const {
    programSourceId,
    settings,
    setRecordingState,
    setRecordingSeconds,
    setRecordingResult,
    setRecordingError,
    recordingResult
  } = useAppStore();

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const systemStreamRef = useRef<MediaStream | null>(null);
  const micStreamRef = useRef<MediaStream | null>(null);

  const clearTimer = () => {
    if (timerRef.current) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startRecording = useCallback(async () => {
    if (!canvasRef.current) {
      setRecordingError("Program output is not ready.");
      return;
    }

    if (!programSourceId) {
      setRecordingError("Select a display and TAKE it to Program before recording.");
      return;
    }

    if (recorderRef.current) {
      return;
    }

    setRecordingError(null);
    setRecordingResult(null);
    setRecordingSeconds(0);

    const canvasStream = canvasRef.current.captureStream(settings.frameRate);
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
        setRecordingError("System audio is unavailable for this display.");
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
        setRecordingError("Microphone access was denied or unavailable.");
      }
    }

    if (destination) {
      tracks.push(...destination.stream.getAudioTracks());
    }

    const outputStream = new MediaStream(tracks);
    const mimeType = pickRecorderMimeType();
    const { videoBitsPerSecond } = getQualityProfile(settings.qualityPreset);

    const recorder = new MediaRecorder(outputStream, {
      mimeType: mimeType || undefined,
      videoBitsPerSecond
    });

    recorderRef.current = recorder;
    chunksRef.current = [];

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };

    recorder.onstop = async () => {
      clearTimer();
      setRecordingState(false);

      const blob = new Blob(chunksRef.current, { type: recorder.mimeType });
      const buffer = new Uint8Array(await blob.arrayBuffer());

      try {
        const result = await window.dualcast.saveRecording({ data: buffer });
        setRecordingResult(result);
      } catch (error) {
        setRecordingError("Failed to save recording.");
      }

      stopMediaStream(canvasStream);
      stopMediaStream(systemStreamRef.current);
      stopMediaStream(micStreamRef.current);
      audioContextRef.current?.close();
      recorderRef.current = null;
    };

    recorder.start(1000);
    setRecordingState(true);

    timerRef.current = window.setInterval(() => {
      setRecordingSeconds((prev) => prev + 1);
    }, 1000);
  }, [canvasRef, programSourceId, setRecordingError, setRecordingResult, setRecordingSeconds, setRecordingState, settings.audioMode, settings.frameRate, settings.qualityPreset]);

  const stopRecording = useCallback(() => {
    if (recorderRef.current && recorderRef.current.state !== "inactive") {
      recorderRef.current.stop();
    }
  }, []);

  const openRecordingFolder = useCallback(async () => {
    if (recordingResult?.filePath) {
      await window.dualcast.openFolder(recordingResult.filePath);
    }
  }, [recordingResult]);

  return {
    startRecording,
    stopRecording,
    openRecordingFolder
  };
};

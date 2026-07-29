import { useCallback, useMemo, useRef } from "react";
import { useAppStore } from "../store/useAppStore";
import { pickRecorderMimeType, stopMediaStream } from "../utils/media";
import { AudioMode } from "../../shared/types";
import { getQualityProfile } from "../../shared/recording";

const shouldIncludeSystem = (mode: AudioMode) => mode === "system" || mode === "both";
const shouldIncludeMic = (mode: AudioMode) => mode === "microphone" || mode === "both";

export const useProgramRecorder = (canvasRef: React.RefObject<HTMLCanvasElement>) => {
  const {
    programSceneId,
    scenes,
    settings,
    programAudioStream,
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
  const micStreamRef = useRef<MediaStream | null>(null);
  const programScene = useMemo(() => scenes.find((scene) => scene.id === programSceneId) ?? null, [programSceneId, scenes]);
  const hasProgramSources = Boolean(programScene && programScene.sourceIds.length > 0);

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

    if (!programSceneId || !hasProgramSources) {
      setRecordingError("Select a scene and TAKE it to Program before recording.");
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
        setRecordingError("Program audio is unavailable for this scene.");
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
        const message = error instanceof Error ? error.message : "Failed to save recording.";
        setRecordingError(message);
      }

      stopMediaStream(canvasStream);
      stopMediaStream(micStreamRef.current);
      audioContextRef.current?.close();
      recorderRef.current = null;
    };

    recorder.start(1000);
    setRecordingState(true);

    timerRef.current = window.setInterval(() => {
      setRecordingSeconds((prev) => prev + 1);
    }, 1000);
  }, [
    canvasRef,
    programSceneId,
    hasProgramSources,
    programAudioStream,
    setRecordingError,
    setRecordingResult,
    setRecordingSeconds,
    setRecordingState,
    settings.audioMode,
    settings.frameRate,
    settings.qualityPreset
  ]);

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

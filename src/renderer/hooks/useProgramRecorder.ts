import { useCallback, useRef } from "react";
import { useAppStore } from "../store/useAppStore";
import { pickRecorderMimeType, stopMediaStream } from "../utils/media";
import { getQualityProfile } from "../../shared/recording";

export const useProgramRecorder = (canvasRef: React.RefObject<HTMLCanvasElement>) => {
  const {
    programSceneId,
    programSceneSnapshot,
    settings,
    programAudioStream,
    setRecordingState,
    setRecordingSeconds,
    setRecordingResult,
    setRecordingError,
    recordingResult
  } = useAppStore();

  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  const writeQueueRef = useRef<Promise<void>>(Promise.resolve());
  const writeErrorRef = useRef<string | null>(null);
  const hasProgramSources = Boolean(programSceneSnapshot?.sourceIds.length);

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

    const captureAudio = settings.audioMode !== "none" && Boolean(programAudioStream?.getAudioTracks().length);
    const audioContext = captureAudio ? new AudioContext() : null;
    const destination = audioContext ? audioContext.createMediaStreamDestination() : null;
    audioContextRef.current = audioContext;

    if (programAudioStream && audioContext && destination && programAudioStream.getAudioTracks().length > 0) {
      try {
        const source = audioContext.createMediaStreamSource(programAudioStream);
        source.connect(destination);
      } catch {
        setRecordingError("Program audio is unavailable for this scene.");
      }
    }

    if (destination) {
      tracks.push(...destination.stream.getAudioTracks());
    }

    const outputStream = new MediaStream(tracks);
    const mimeType = pickRecorderMimeType();
    const { videoBitsPerSecond } = getQualityProfile(settings.qualityPreset);

    let recorder: MediaRecorder;
    try {
      recorder = new MediaRecorder(outputStream, {
        mimeType: mimeType || undefined,
        videoBitsPerSecond
      });
    } catch {
      stopMediaStream(canvasStream);
      audioContextRef.current?.close().catch(() => undefined);
      audioContextRef.current = null;
      setRecordingError("Unable to start the recording encoder.");
      return;
    }

    recorderRef.current = recorder;
    writeQueueRef.current = Promise.resolve();
    writeErrorRef.current = null;

    try {
      const session = await window.dualcast.beginRecording();
      sessionIdRef.current = session.sessionId;
    } catch (error) {
      recorderRef.current = null;
      stopMediaStream(canvasStream);
      audioContextRef.current?.close().catch(() => undefined);
      audioContextRef.current = null;
      setRecordingError(error instanceof Error ? error.message : "Unable to prepare the recording file.");
      return;
    }

    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        const chunk = event.data;
        const sessionId = sessionIdRef.current;
        if (!sessionId) return;
        writeQueueRef.current = writeQueueRef.current
          .then(() => chunk.arrayBuffer())
          .then((buffer) => window.dualcast.appendRecordingChunk({ sessionId, data: new Uint8Array(buffer) }))
          .then(() => undefined)
          .catch((error) => {
            writeErrorRef.current = error instanceof Error ? error.message : "Unable to write recording data.";
            setRecordingError(writeErrorRef.current);
            if (recorder.state !== "inactive") recorder.stop();
          });
      }
    };

    recorder.onstop = async () => {
      clearTimer();
      setRecordingState(false);
      const sessionId = sessionIdRef.current;
      sessionIdRef.current = null;

      try {
        await writeQueueRef.current;
        if (!sessionId) throw new Error("The recording file session was lost.");
        if (writeErrorRef.current) {
          await window.dualcast.cancelRecording({ sessionId });
          throw new Error(writeErrorRef.current);
        }
        setRecordingResult(await window.dualcast.finishRecording({ sessionId }));
      } catch (error) {
        if (sessionId) await window.dualcast.cancelRecording({ sessionId }).catch(() => undefined);
        const message = error instanceof Error ? error.message : "Failed to save recording.";
        setRecordingError(message);
      } finally {
        stopMediaStream(canvasStream);
        audioContextRef.current?.close().catch(() => undefined);
        audioContextRef.current = null;
        recorderRef.current = null;
      }
    };

    try {
      recorder.start(1000);
    } catch {
      const sessionId = sessionIdRef.current;
      sessionIdRef.current = null;
      recorderRef.current = null;
      stopMediaStream(canvasStream);
      audioContextRef.current?.close().catch(() => undefined);
      audioContextRef.current = null;
      if (sessionId) await window.dualcast.cancelRecording({ sessionId }).catch(() => undefined);
      setRecordingError("Unable to start the recording encoder.");
      return;
    }
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

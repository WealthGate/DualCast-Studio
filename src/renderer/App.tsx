import React, { useEffect, useRef, useState } from "react";
import Header from "./components/Header";
import DisplayPicker from "./components/DisplayPicker";
import SettingsPanel from "./components/SettingsPanel";
import StreamingPanel from "./components/StreamingPanel";
import CameraPanel from "./components/CameraPanel";
import PreviewProgram from "./components/PreviewProgram";
import { useAppStore } from "./store/useAppStore";
import { useProgramRecorder } from "./hooks/useProgramRecorder";

const App: React.FC = () => {
  const previewVideoRef = useRef<HTMLVideoElement>(null);
  const programVideoRef = useRef<HTMLVideoElement>(null);
  const programCanvasRef = useRef<HTMLCanvasElement>(null);
  const [projectionActive, setProjectionActive] = useState(false);

  const {
    setSettings,
    refreshDisplays,
    takeToProgram,
    cutToBlack,
    clearCutToBlack,
    isRecording,
    programSourceId,
    isCutToBlack,
    isFrozen,
    settings
  } = useAppStore();

  const recorder = useProgramRecorder(programCanvasRef);

  useEffect(() => {
    const init = async () => {
      const settings = await window.dualcast.getSettings();
      setSettings(settings);
      await refreshDisplays();
    };
    init();
  }, [refreshDisplays, setSettings]);

  useEffect(() => {
    window.dualcast.updateProgramState({
      programSourceId,
      isCutToBlack,
      isFrozen,
      qualityPreset: settings.qualityPreset
    });
  }, [programSourceId, isCutToBlack, isFrozen, settings.qualityPreset]);

  useEffect(() => {
    const unsubscribe = window.dualcast.onHotkey((action) => {
      if (action === "toggle-record") {
        if (isRecording) {
          recorder.stopRecording();
        } else {
          recorder.startRecording();
        }
      }
      if (action === "take") {
        takeToProgram();
      }
      if (action === "cut-black") {
        clearCutToBlack();
        cutToBlack();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [clearCutToBlack, cutToBlack, isRecording, recorder, takeToProgram]);

  useEffect(() => {
    const unsubscribeOpen = window.dualcast.onProjectionOpened(() => setProjectionActive(true));
    const unsubscribeClose = window.dualcast.onProjectionClosed(() => setProjectionActive(false));

    return () => {
      unsubscribeOpen();
      unsubscribeClose();
    };
  }, []);

  useEffect(() => {
    if (!projectionActive) {
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
  }, [projectionActive]);

  return (
    <div className="app-shell">
      <Header
        onStartRecording={recorder.startRecording}
        onStopRecording={recorder.stopRecording}
        onOpenFolder={recorder.openRecordingFolder}
      />
      <main className="main-layout">
        <PreviewProgram
          previewVideoRef={previewVideoRef}
          programVideoRef={programVideoRef}
          programCanvasRef={programCanvasRef}
        />
        <aside className="side-panel">
          <DisplayPicker />
          <CameraPanel />
          <SettingsPanel />
          <StreamingPanel programCanvasRef={programCanvasRef} />
        </aside>
      </main>
    </div>
  );
};

export default App;

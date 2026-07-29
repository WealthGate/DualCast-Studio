import React, { useEffect, useRef, useState } from "react";
import Header from "./components/Header";
import SettingsPanel from "./components/SettingsPanel";
import StreamingPanel from "./components/StreamingPanel";
import PreviewProgram from "./components/PreviewProgram";
import VenuePanel from "./components/VenuePanel";
import EditorPanel from "./components/EditorPanel";
import { useAppStore } from "./store/useAppStore";
import { useProgramRecorder } from "./hooks/useProgramRecorder";

const App: React.FC = () => {
  const programCanvasRef = useRef<HTMLCanvasElement>(null);
  const [sideTab, setSideTab] = useState<"system" | "streaming" | "venue" | "editor">("streaming");

  const {
    setSettings,
    setStudioState,
    refreshDisplays,
    takeToProgram,
    cutToBlack,
    clearCutToBlack,
    toggleFreeze,
    isRecording,
    programSceneId,
    isCutToBlack,
    isFrozen,
    settings
  } = useAppStore();

  const recorder = useProgramRecorder(programCanvasRef);

  useEffect(() => {
    const init = async () => {
      const settings = await window.dualcast.getSettings();
      setSettings(settings);
      setStudioState(settings.studioState);
      await refreshDisplays();
      if (settings.networkOutput.enabled) {
        await window.dualcast.startNetworkOutput({
          port: settings.networkOutput.port,
          operatorPin: settings.networkOutput.operatorPin
        });
      }
    };
    init();
  }, [refreshDisplays, setSettings, setStudioState]);

  useEffect(() => {
    window.dualcast.updateProgramState({
      programSceneId,
      isCutToBlack,
      isFrozen,
      qualityPreset: settings.qualityPreset
    });
  }, [programSceneId, isCutToBlack, isFrozen, settings.qualityPreset]);

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
        if (isCutToBlack) {
          clearCutToBlack();
        } else {
          cutToBlack();
        }
      }
    });

    return () => {
      unsubscribe();
    };
  }, [clearCutToBlack, cutToBlack, isCutToBlack, isRecording, recorder, takeToProgram]);

  useEffect(() => {
    const unsubscribe = window.dualcast.onRemoteOperatorAction((action) => {
      if (action === "toggle-record") {
        if (isRecording) {
          recorder.stopRecording();
        } else {
          recorder.startRecording();
        }
      } else if (action === "take") {
        takeToProgram();
      } else if (action === "cut-black") {
        if (isCutToBlack) {
          clearCutToBlack();
        } else {
          cutToBlack();
        }
      } else if (action === "toggle-freeze") {
        toggleFreeze();
      }
    });
    return () => unsubscribe();
  }, [
    clearCutToBlack,
    cutToBlack,
    isCutToBlack,
    isRecording,
    recorder,
    takeToProgram,
    toggleFreeze
  ]);

  return (
    <div className="app-shell">
      <Header
        onStartRecording={recorder.startRecording}
        onStopRecording={recorder.stopRecording}
        onOpenFolder={recorder.openRecordingFolder}
      />
      <main className="main-layout">
        <PreviewProgram programCanvasRef={programCanvasRef} />
        <aside className="side-panel">
          <nav className="side-nav" aria-label="Control center">
            <button className={sideTab === "system" ? "active" : ""} onClick={() => setSideTab("system")}>
              System
            </button>
            <button className={sideTab === "streaming" ? "active" : ""} onClick={() => setSideTab("streaming")}>
              Streaming
            </button>
            <button className={sideTab === "venue" ? "active" : ""} onClick={() => setSideTab("venue")}>
              Venue
            </button>
            <button className={sideTab === "editor" ? "active" : ""} onClick={() => setSideTab("editor")}>
              Editor
            </button>
          </nav>
          {sideTab === "system" ? <SettingsPanel /> : null}
          {sideTab === "streaming" ? <StreamingPanel programCanvasRef={programCanvasRef} /> : null}
          {sideTab === "venue" ? <VenuePanel /> : null}
          {sideTab === "editor" ? <EditorPanel /> : null}
        </aside>
      </main>
    </div>
  );
};

export default App;

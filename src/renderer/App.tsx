import React, { useEffect, useRef } from "react";
import Header from "./components/Header";
import SettingsPanel from "./components/SettingsPanel";
import StreamingPanel from "./components/StreamingPanel";
import PreviewProgram from "./components/PreviewProgram";
import VenuePanel from "./components/VenuePanel";
import EditorPanel from "./components/EditorPanel";
import SceneSourcesPanel from "./components/SceneSourcesPanel";
import AudioMixerPanel from "./components/AudioMixerPanel";
import TransitionsPanel from "./components/TransitionsPanel";
import ProductionControlsPanel from "./components/ProductionControlsPanel";
import DockWorkspace, { DockPanelDefinition } from "./components/DockWorkspace";
import { useAppStore } from "./store/useAppStore";
import { useProgramRecorder } from "./hooks/useProgramRecorder";
import { useProgramStreamer } from "./hooks/useProgramStreamer";

const App: React.FC = () => {
  const programCanvasRef = useRef<HTMLCanvasElement>(null);

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
  const streamer = useProgramStreamer(programCanvasRef);

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

  const dockPanels: DockPanelDefinition[] = [
    { id: "scenes", title: "Scenes & Sources", content: <SceneSourcesPanel /> },
    { id: "audio", title: "Audio Mixer", content: <AudioMixerPanel /> },
    { id: "transitions", title: "Scene Transitions", content: <TransitionsPanel /> },
    {
      id: "controls",
      title: "Controls",
      content: (
        <ProductionControlsPanel
          onStartRecording={recorder.startRecording}
          onStopRecording={recorder.stopRecording}
          onOpenFolder={recorder.openRecordingFolder}
        />
      )
    },
    {
      id: "streaming",
      title: "Live Streaming",
      content: <StreamingPanel streamer={streamer} />
    },
    { id: "venue", title: "Venue & Outputs", content: <VenuePanel /> },
    { id: "system", title: "System Settings", content: <SettingsPanel /> },
    { id: "editor", title: "Post Editor", content: <EditorPanel /> }
  ];

  return (
    <div className="app-shell">
      <Header
        onStartRecording={recorder.startRecording}
        onStopRecording={recorder.stopRecording}
        onOpenFolder={recorder.openRecordingFolder}
      />
      <DockWorkspace
        panels={dockPanels}
        center={<PreviewProgram programCanvasRef={programCanvasRef} />}
      />
    </div>
  );
};

export default App;

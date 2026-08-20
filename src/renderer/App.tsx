import React, { useEffect, useRef, useState } from "react";
import Header from "./components/Header";
import SettingsPanel from "./components/SettingsPanel";
import StreamingPanel from "./components/StreamingPanel";
import PreviewProgram from "./components/PreviewProgram";
import VenuePanel from "./components/VenuePanel";
import EditorPanel from "./components/EditorPanel";
import SceneSourcesPanel from "./components/SceneSourcesPanel";
import ScenesPanel from "./components/ScenesPanel";
import SanctuaryDisplaysPanel from "./components/SanctuaryDisplaysPanel";
import AudioMixerPanel from "./components/AudioMixerPanel";
import TransitionsPanel from "./components/TransitionsPanel";
import ProductionControlsPanel from "./components/ProductionControlsPanel";
import DockWorkspace, { DockPanelDefinition } from "./components/DockWorkspace";
import UpdateBanner from "./components/UpdateBanner";
import LowerThirdPanel from "./components/LowerThirdPanel";
import ScripturePanel from "./components/ScripturePanel";
import { useAppStore } from "./store/useAppStore";
import { useProgramRecorder } from "./hooks/useProgramRecorder";
import { useProgramStreamer } from "./hooks/useProgramStreamer";
import { UpdateStatusPayload, WorkspaceViewMode } from "../shared/types";

const App: React.FC = () => {
  const programCanvasRef = useRef<HTMLCanvasElement>(null);
  const [viewMode, setViewMode] = useState<WorkspaceViewMode>(() => {
    const saved = localStorage.getItem("openchurch:view-mode");
    if (saved === "program" || saved === "program-only") return "program-only";
    if (saved === "program-focus") return "program-focus";
    return "studio";
  });
  const [updateStatus, setUpdateStatus] = useState<UpdateStatusPayload | null>(null);
  const [showUpdateStatus, setShowUpdateStatus] = useState(false);
  const [startupError, setStartupError] = useState<string | null>(null);

  const {
    setSettings,
    setStudioState,
    refreshDisplays,
    selectPreviewScene,
    setProgramScene,
    takeToProgram,
    cutToBlack,
    clearCutToBlack,
    toggleFreeze,
    setManualBlend,
    isRecording,
    programSceneId,
    isCutToBlack,
    isFrozen,
    settings
  } = useAppStore();

  const recorder = useProgramRecorder(programCanvasRef);
  const streamer = useProgramStreamer(programCanvasRef);

  useEffect(() => {
    const mediaQuery = window.matchMedia("(prefers-color-scheme: light)");
    const applyTheme = () => {
      const resolvedTheme = settings.theme === "system" ? (mediaQuery.matches ? "light" : "dark") : settings.theme;
      document.documentElement.dataset.theme = resolvedTheme;
      document.documentElement.style.colorScheme = resolvedTheme === "light" ? "light" : "dark";
    };
    applyTheme();
    mediaQuery.addEventListener("change", applyTheme);
    return () => mediaQuery.removeEventListener("change", applyTheme);
  }, [settings.theme]);

  useEffect(() => {
    localStorage.setItem("openchurch:view-mode", viewMode);
    if (viewMode !== "studio") setManualBlend(0);
  }, [setManualBlend, viewMode]);

  useEffect(() => {
    const init = async () => {
      try {
        const settings = await window.dualcast.getSettings();
        setSettings(settings);
        setStudioState(settings.studioState);
        try {
          await refreshDisplays();
        } catch {
          setStartupError("Display and window sources could not be listed. Check screen-recording permission, then restart the studio.");
        }
        if (settings.networkOutput.enabled) {
          await window.dualcast.startNetworkOutput({
            port: settings.networkOutput.port,
            operatorPin: settings.networkOutput.operatorPin
          });
        }
      } catch (error) {
        setStartupError(error instanceof Error ? error.message : "The studio settings could not be loaded.");
        try {
          const settings = await window.dualcast.getSettings();
          if (settings.networkOutput.enabled) {
            const updated = await window.dualcast.updateSettings({
              networkOutput: { ...settings.networkOutput, enabled: false }
            });
            setSettings(updated);
          }
        } catch {
          // The visible startup error provides the recovery path.
        }
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

  useEffect(() => {
    const unsubscribe = window.dualcast.onMultiviewAction((action) => {
      if (action.action === "preview") {
        selectPreviewScene(action.sceneId);
      } else {
        setProgramScene(action.sceneId);
      }
    });
    return () => unsubscribe();
  }, [selectPreviewScene, setProgramScene]);

  useEffect(() => {
    let active = true;
    const unsubscribe = window.dualcast.onUpdateStatus((status) => {
      if (!active) {
        return;
      }
      setUpdateStatus(status);
      if (status.state === "available" || status.state === "downloading" || status.state === "downloaded") {
        setShowUpdateStatus(true);
      }
    });
    window.dualcast.getUpdateStatus().then((status) => {
      if (active) {
        setUpdateStatus(status);
        if (status.state === "available" || status.state === "downloading" || status.state === "downloaded") {
          setShowUpdateStatus(true);
        }
      }
    }).catch(() => undefined);
    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const handleCheckForUpdates = () => {
    setShowUpdateStatus(true);
    window.dualcast.checkForUpdates().then(setUpdateStatus).catch(() => undefined);
  };

  const handleDownloadUpdate = () => {
    setShowUpdateStatus(true);
    window.dualcast.downloadUpdate().catch(() => undefined);
  };

  const handleInstallUpdate = () => {
    window.dualcast.installUpdate().catch(() => undefined);
  };

  const dockPanels: DockPanelDefinition[] = [
    { id: "scenes", title: "Scenes", content: <ScenesPanel directToProgram={viewMode === "program-focus"} /> },
    { id: "sources", title: "Sources", content: <SceneSourcesPanel /> },
    { id: "audio", title: "Audio Mixer", content: <AudioMixerPanel /> },
    { id: "transitions", title: "Scene Transitions", content: <TransitionsPanel canBlend={viewMode === "studio"} /> },
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
    { id: "lower-third", title: "Lower Third Studio", content: <LowerThirdPanel /> },
    { id: "scripture", title: "Scripture", content: <ScripturePanel /> },
    { id: "displays", title: "Sanctuary Displays", content: <SanctuaryDisplaysPanel /> },
    { id: "system", title: "System Settings", content: <SettingsPanel /> },
    { id: "editor", title: "Post Editor", content: <EditorPanel /> }
  ];

  return (
    <div className={`app-shell ${viewMode}-mode`}>
      <Header
        onStartRecording={recorder.startRecording}
        onStopRecording={recorder.stopRecording}
        onOpenFolder={recorder.openRecordingFolder}
        onOpenMultiview={() => window.dualcast.openMultiview()}
        onCheckForUpdates={handleCheckForUpdates}
        onDownloadUpdate={handleDownloadUpdate}
        onInstallUpdate={handleInstallUpdate}
        onDownloadUserGuide={() => window.dualcast.downloadUserGuide().catch(() => undefined)}
        updateStatus={updateStatus}
        viewMode={viewMode}
        onChangeViewMode={setViewMode}
      />
      {showUpdateStatus && updateStatus && updateStatus.state !== "idle" ? (
        <UpdateBanner
          status={updateStatus}
          onCheck={handleCheckForUpdates}
          onDownload={handleDownloadUpdate}
          onInstall={handleInstallUpdate}
          onOpenRelease={() => window.dualcast.openReleasePage()}
          onDismiss={() => setShowUpdateStatus(false)}
        />
      ) : null}
      {startupError ? (
        <section className="update-banner state-error" role="alert">
          <div className="update-copy"><strong>Studio startup warning</strong><span>{startupError}</span></div>
          <div className="update-actions"><button className="btn btn-outline" onClick={() => setStartupError(null)}>Dismiss</button></div>
        </section>
      ) : null}
      <DockWorkspace
        panels={dockPanels}
        center={<PreviewProgram programCanvasRef={programCanvasRef} viewMode={viewMode} />}
      />
    </div>
  );
};

export default App;

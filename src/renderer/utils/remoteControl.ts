import type { RemoteCommand, RemoteControlState } from "../../shared/remoteControl";
import { isRemoteCommand } from "../../shared/remoteControl";
import { useAppStore } from "../store/useAppStore";
import { createScriptureSlides, splitTextIntoSlides } from "./presentationSlides";
import { sanitizeScriptureText } from "../../shared/scriptureText";
import { presentationTextMode } from "../../shared/displayText";

export const getRemoteControlState = (streamStatus: string): RemoteControlState => {
  const s = useAppStore.getState();
  const lower = s.settings.lowerThird;
  return {
    stationName: s.settings.operatorStationName,
    scenes: s.scenes.map(scene => ({ id: scene.id, name: scene.name, enabled: scene.enabled !== false,
      cameras: scene.sourceIds.flatMap(id => s.sources[id]?.type === "camera" && s.sources[id].enabled ? [s.sources[id].name] : []) })),
    previewSceneId: s.previewSceneId, programSceneId: s.presentedProgram ? s.presentedProgram.scene?.id ?? null : s.programSceneId,
    isBlack: s.isCutToBlack, isFrozen: s.isFrozen, isRecording: s.isRecording, recordingSeconds: s.recordingSeconds,
    streamStatus, textMode: s.displayTextMode, lowerThirdHidden: s.isLowerThirdHidden,
    hasLogo: Boolean(lower.imageUrl || lower.bibleImageUrl), masterGain: s.settings.masterAudioGain,
    slides: lower.slides.map(({ id, text, title, reference, kind, deckId, deckTitle }) => ({
      id, text: kind === "scripture" ? sanitizeScriptureText(text) : text, title,
      reference: kind === "scripture" ? sanitizeScriptureText(reference ?? "") : reference, kind, deckId, deckTitle
    })),
    activeSlideId: lower.activeSlideId, programSlideId: lower.programSlideId,
    scriptureSource: s.settings.scriptureSourceId && s.settings.scriptureSourceId !== "online" ? "Desktop offline Bible library" : "Desktop online Bible provider",
    tickers: Object.values(s.programSources).flatMap(source => source.type === "scrolling-text" ? [{
      id: source.id, name: source.name, text: source.data.text, speed: source.data.speed,
      direction: source.data.direction, enabled: source.enabled, paused: source.media?.paused === true
    }] : [])
  };
};

type RecordingController = { startRecording: () => Promise<void>; stopRecording: () => void };

export const executeRemoteCommand = async (command: RemoteCommand, recorder: RecordingController, expiresAt = Date.now() + 10_000): Promise<string> => {
  const assertCurrent = () => { if (Date.now() > expiresAt) throw new Error("Command expired. Check the connection and try again."); };
  assertCurrent();
  if (!isRemoteCommand(command)) throw new Error("Invalid mobile command.");
  const s = useAppStore.getState();
  const showText = () => {
    useAppStore.getState().setDisplayTextMode(presentationTextMode(useAppStore.getState().displayTextMode));
    if (useAppStore.getState().isLowerThirdHidden) useAppStore.getState().toggleLowerThirdHidden();
  };
  const cue = async (slideId: string, live: boolean) => {
    const lower = useAppStore.getState().settings.lowerThird;
    if (!lower.slides.some(slide => slide.id === slideId)) throw new Error("This slide no longer exists. Refresh the remote.");
    if (live) showText();
    await useAppStore.getState().stageLowerThird(lower.slides, slideId, live);
  };
  switch (command.action) {
    case "scene-preview": case "scene-live": {
      const scene = s.scenes.find(scene => scene.id === command.sceneId && scene.enabled !== false);
      if (!scene) throw new Error("This scene is unavailable.");
      if (command.action === "scene-preview") s.selectPreviewScene(scene.id);
      else s.setProgramScene(scene.id);
      return `${scene.name} ${command.action === "scene-live" ? "sent to Program" : "staged in Preview"}.`;
    }
    case "take":
      if (!s.scenes.some(scene => scene.id === s.previewSceneId && scene.enabled !== false)) throw new Error("Choose an enabled Preview scene first.");
      s.applyTransition(command.transition); return "Preview sent to Program.";
    case "black": command.enabled ? s.cutToBlack() : s.clearCutToBlack(); return command.enabled ? "Program is black." : "Program restored.";
    case "freeze": if (s.isFrozen !== command.enabled) s.toggleFreeze(); return command.enabled ? "Program frozen." : "Program unfrozen.";
    case "lower-third": if (s.isLowerThirdHidden === command.enabled) s.toggleLowerThirdHidden(); return command.enabled ? "Lower third shown." : "Lower third hidden.";
    case "text-mode":
      if (command.mode === "logo" && !getRemoteControlState("").hasLogo) throw new Error("Configure a logo in the desktop Lower Third Studio first.");
      s.setDisplayTextMode(command.mode); return "Display text mode updated.";
    case "record":
      if (command.enabled && !s.isRecording) {
        await recorder.startRecording();
        if (!useAppStore.getState().isRecording) throw new Error(useAppStore.getState().recordingError || "Recording could not start. Check the studio.");
      } else if (!command.enabled && s.isRecording) recorder.stopRecording();
      return command.enabled ? "Recording is running." : "Recording stop requested. The file is saved on the studio computer.";
    case "text-stage": {
      const deckId = crypto.randomUUID();
      const slides = splitTextIntoSlides(command.text, { linesPerSlide: command.lines }).map(text => ({
        id: crypto.randomUUID(), text, title: command.title.trim(), kind: "text" as const, deckId, deckTitle: command.title.trim() || "Mobile text"
      }));
      if (!slides.length) throw new Error("Enter some text first.");
      await s.stageLowerThird([...s.settings.lowerThird.slides, ...slides], slides[0].id);
      return `${slides.length} text slide(s) staged. Check the cue, then tap Show staged text.`;
    }
    case "scripture-stage": {
      const libraryId = s.settings.scriptureSourceId;
      const result = libraryId && libraryId !== "online"
        ? await window.dualcast.lookupScriptureLibrary({ libraryId, reference: command.reference.trim() })
        : await window.dualcast.fetchScripture({ reference: command.reference.trim() });
      assertCurrent();
      if (s.presentationGeneration !== useAppStore.getState().presentationGeneration) throw new Error("The slide queue was cleared. Load Scripture again when ready.");
      const slides = createScriptureSlides(result, { mode: "verse", linesPerSlide: 2, deckId: crypto.randomUUID(), deckTitle: sanitizeScriptureText(result.reference), createId: () => crypto.randomUUID() });
      if (!slides.length) throw new Error("No Scripture text was returned.");
      const current = useAppStore.getState();
      await current.stageLowerThird([...current.settings.lowerThird.slides, ...slides], slides[0].id);
      return `${sanitizeScriptureText(result.reference)} staged in Preview.`;
    }
    case "text-live":
      if (!s.settings.lowerThird.activeSlideId) throw new Error("Stage text or Scripture first.");
      showText(); await s.stageLowerThird(s.settings.lowerThird.slides, s.settings.lowerThird.activeSlideId, true); return "Staged text is live.";
    case "text-clear": await s.clearProgramText(); return "Presentation text cleared from Program.";
    case "slide-cue": await cue(command.slideId, command.live); return command.live ? "Slide is live." : "Slide staged in Preview.";
    case "slide-step": {
      const lower = s.settings.lowerThird;
      const current = lower.slides.find(slide => slide.id === (command.live ? lower.programSlideId : lower.activeSlideId));
      if (!current) throw new Error("Choose a slide first.");
      const deck = current.deckId ? lower.slides.filter(slide => slide.deckId === current.deckId) : [current];
      const next = deck[deck.indexOf(current) + command.direction];
      if (!next) throw new Error(command.direction === 1 ? "This is the last slide in this presentation." : "This is the first slide in this presentation.");
      await cue(next.id, command.live); return command.live ? "Slide is live." : "Slide staged in Preview.";
    }
    case "ticker": {
      const source = s.programSources[command.sourceId];
      if (source?.type !== "scrolling-text") throw new Error("This ticker is no longer on Program. Refresh the remote.");
      const updated = { ...source, enabled: command.enabled, media: { ...source.media, paused: command.paused },
        data: { ...source.data, text: command.text, speed: command.speed, direction: command.direction } };
      // Edit the committed ticker without taking any other Preview edits live.
      useAppStore.setState({ programSources: { ...s.programSources, [source.id]: updated } });
      const originalId = source.id.replace(/^program:/, "");
      const original = s.sources[originalId];
      if (original?.type === "scrolling-text") {
        // Preserve pending desktop layout/style edits in the Preview source.
        s.updateSource(originalId, { enabled: command.enabled, media: { ...original.media, paused: command.paused },
          data: { ...original.data, text: command.text, speed: command.speed, direction: command.direction } });
        await s.persistStudioState();
      }
      return "Program ticker updated.";
    }
    case "master-gain": await s.updateSettings({ masterAudioGain: command.gain }); return `Master audio ${Math.round(command.gain * 100)}%.`;
  }
};

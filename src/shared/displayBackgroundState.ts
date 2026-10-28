import { ProgramState, SanctuaryDisplaySettings } from "./types";
import { DisplayBackgrounds } from "./backgrounds";
import { normalizeSanctuaryDisplay } from "./sanctuaryDisplay";

// Migrate old implicit background overrides once; subsequent mode choices are explicit.
export function explicitDisplayRouting(config: SanctuaryDisplaySettings | undefined, backgrounds?: DisplayBackgrounds): SanctuaryDisplaySettings {
  const normalized = normalizeSanctuaryDisplay(config);
  return normalized.displayModes ? normalized : { ...normalized, mode: backgrounds?.sanctuary ? "independent" : normalized.mode,
    displayModes: Object.fromEntries(Object.keys(backgrounds?.displays ?? {}).map(id => [id, "independent" as const])) };
}

export function modeForDisplay(config: SanctuaryDisplaySettings | undefined, backgrounds: DisplayBackgrounds | undefined, displayId: string): "program" | "independent" {
  const routing = explicitDisplayRouting(config, backgrounds);
  return routing.displayModes?.[displayId] ?? routing.mode;
}

// Resolve each monitor separately; a custom text screen must not change another
// monitor's mirrored Program or any recording/stream/virtual camera.
export function stateForDisplay(state: ProgramState, displayId: string): ProgramState {
  const background = state.backgrounds?.displays?.[displayId] ?? state.backgrounds?.sanctuary;
  if (!state.sanctuary) return state;
  const mode = modeForDisplay(state.sanctuary.settings, state.backgrounds, displayId);
  if (mode === state.sanctuary.settings.mode && (!background || mode === "program")) return state;
  return { ...state, sanctuary: { ...state.sanctuary, background: mode === "independent" ? background : undefined, settings: { ...state.sanctuary.settings, mode } } };
}

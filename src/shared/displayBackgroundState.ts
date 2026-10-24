import { ProgramState } from "./types";

// Resolve each monitor separately; a custom text screen must not change another
// monitor's mirrored Program or any recording/stream/virtual camera.
export function stateForDisplay(state: ProgramState, displayId: string): ProgramState {
  const background = state.backgrounds?.displays?.[displayId] ?? state.backgrounds?.sanctuary;
  if (!background || !state.sanctuary) return state;
  return { ...state, sanctuary: { ...state.sanctuary, background, settings: { ...state.sanctuary.settings, mode: "independent" } } };
}

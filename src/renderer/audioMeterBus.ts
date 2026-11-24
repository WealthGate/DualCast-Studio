import { useSyncExternalStore } from "react";

export type AudioMeterLevel = {
  left: number;
  right: number;
  channels: 1 | 2;
  clipping: boolean;
};

export type AudioMeterSnapshot = Record<string, AudioMeterLevel>;

let snapshot: AudioMeterSnapshot = {};
let lastSignalAt = -Infinity;
const listeners = new Set<() => void>();

export const publishAudioMeters = (next: AudioMeterSnapshot) => {
  snapshot = next;
  if (!next.master) lastSignalAt = -Infinity;
  else if (Math.max(next.master.left, next.master.right) > 0) lastSignalAt = performance.now();
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = () => snapshot;

export const useAudioMeterLevels = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

const hasRecentSignal = () => performance.now() - lastSignalAt < 2500;
export const useProgramSignal = () => useSyncExternalStore(subscribe, hasRecentSignal, hasRecentSignal);

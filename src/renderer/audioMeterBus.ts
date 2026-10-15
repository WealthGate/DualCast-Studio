import { useSyncExternalStore } from "react";

export type AudioMeterLevel = {
  left: number;
  right: number;
  channels: 1 | 2;
  clipping: boolean;
};

export type AudioMeterSnapshot = Record<string, AudioMeterLevel>;

let snapshot: AudioMeterSnapshot = {};
const listeners = new Set<() => void>();

export const publishAudioMeters = (next: AudioMeterSnapshot) => {
  snapshot = next;
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const getSnapshot = () => snapshot;

export const useAudioMeterLevels = () => useSyncExternalStore(subscribe, getSnapshot, getSnapshot);

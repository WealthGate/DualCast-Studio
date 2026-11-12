import type { NativeCaptureFrame } from "../../src/shared/types";

// Preserve inter-frame dependencies while bounding live IPC history. If the
// consumer falls behind, resume at a keyframe instead of replaying old video.
export const createH264Relay = (send: (frame: NativeCaptureFrame & { sequence: number }) => void, maxBytes = 2 * 1024 * 1024) => {
  let sequence = 0, inFlight: number | null = null, bytes = 0, needsKey = true;
  let queued: { frame: NativeCaptureFrame; at: number }[] = [];
  const drain = () => {
    if (inFlight !== null) return;
    while (queued.length) {
      const item = queued.shift()!; bytes -= item.frame.data!.byteLength;
      if (Date.now() - item.at > 200) { needsKey = true; continue; }
      if (needsKey && !item.frame.keyFrame) continue;
      needsKey = false; inFlight = ++sequence;
      send({ ...item.frame, sequence }); return;
    }
  };
  return {
    offer: (frame: NativeCaptureFrame) => {
      if (queued.length >= 6 || bytes + frame.data!.byteLength > maxBytes) { queued = []; bytes = 0; needsKey = true; }
      if (needsKey && !frame.keyFrame) return;
      queued.push({ frame, at: Date.now() }); bytes += frame.data!.byteLength; drain();
    },
    acknowledge: (value: number) => { if (value === inFlight) { inFlight = null; drain(); } }
  };
};

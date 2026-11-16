import type { NativeCaptureFrame } from "../../shared/types";

export const createVideoFrameDecoder = (draw: (frame: VideoFrame) => void, fail: (error: Error) => void) => {
  let decoder: VideoDecoder | null = null;
  let codec = "", needsKey = true, stopped = false;
  let pendingFrames = 0;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let stillDecoder: VideoDecoder | null = null;
  let history: NativeCaptureFrame[] = [], historyBytes = 0, lastPresented = -1;
  let acceleration: HardwareAcceleration = "prefer-hardware";
  const reset = () => { clearTimeout(idleTimer); pendingFrames = 0; history = []; historyBytes = 0; if (stillDecoder && stillDecoder.state !== "closed") stillDecoder.close(); stillDecoder = null; if (decoder && decoder.state !== "closed") decoder.close(); decoder = null; needsKey = true; };
  const present = (frame: VideoFrame) => {
    try {
      if (!stopped && (frame.timestamp == null || frame.timestamp >= lastPresented)) {
        lastPresented = frame.timestamp ?? lastPresented;
        draw(frame);
      }
    } finally { frame.close(); }
  };
  return {
    decode: (packet: NativeCaptureFrame) => {
      if (stopped || !packet.data || !packet.codec) return;
      try {
        if (decoder && decoder.decodeQueueSize > 4) reset();
        if (needsKey && !packet.keyFrame) return;
        if (!decoder || codec !== packet.codec) {
          reset(); if (!packet.keyFrame) return;
          codec = packet.codec;
          decoder = new VideoDecoder({
            output: frame => { pendingFrames = Math.max(0, pendingFrames - 1); present(frame); },
            error: error => {
              if (stopped) return;
              reset();
              if (acceleration === "prefer-hardware") acceleration = "no-preference";
              else fail(error);
            }
          });
          decoder.configure({ codec, hardwareAcceleration: acceleration, optimizeForLatency: true });
        }
        needsKey = false;
        if (packet.keyFrame) { history = []; historyBytes = 0; }
        historyBytes += packet.data.byteLength;
        if (historyBytes <= 8 * 1024 * 1024 && history.length < 120 && (packet.keyFrame || history.length)) history.push(packet);
        else history = [];
        pendingFrames++;
        decoder.decode(new EncodedVideoChunk({ type: packet.keyFrame ? "key" : "delta", timestamp: packet.timestamp ?? 0, data: packet.data as Uint8Array<ArrayBuffer> }));
        clearTimeout(idleTimer);
        const current = decoder;
        idleTimer = setTimeout(() => {
          if (stopped || decoder !== current || !pendingFrames) return;
          if (!history.length || stillDecoder) return;
          // Drain a bounded still-picture decoder. Flushing the primary decoder
          // would require a new keyframe and strand a static window on resume.
          const preview = new VideoDecoder({ output: present, error: () => undefined });
          stillDecoder = preview;
          try {
            preview.configure({ codec, hardwareAcceleration: "prefer-software", optimizeForLatency: true });
            for (const frame of history) preview.decode(new EncodedVideoChunk({ type: frame.keyFrame ? "key" : "delta", timestamp: frame.timestamp ?? 0, data: frame.data as Uint8Array<ArrayBuffer> }));
            void preview.flush().catch(() => undefined).finally(() => {
              if (preview.state !== "closed") preview.close();
              if (stillDecoder === preview) stillDecoder = null;
            });
          } catch { if (preview.state !== "closed") preview.close(); stillDecoder = null; }
        }, 150);
      } catch (error) { if (!stopped) fail(error instanceof Error ? error : new Error(String(error))); }
    },
    stop: () => { stopped = true; reset(); }
  };
};

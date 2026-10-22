import type { NativeCaptureFrame } from "../../shared/types";

export const createVideoFrameDecoder = (draw: (frame: VideoFrame) => void, fail: (error: Error) => void) => {
  let decoder: VideoDecoder | null = null;
  let codec = "", needsKey = true, stopped = false;
  let acceleration: HardwareAcceleration = "prefer-hardware";
  const reset = () => { if (decoder && decoder.state !== "closed") decoder.close(); decoder = null; needsKey = true; };
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
            output: frame => { try { if (!stopped) draw(frame); } finally { frame.close(); } },
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
        decoder.decode(new EncodedVideoChunk({ type: packet.keyFrame ? "key" : "delta", timestamp: packet.timestamp ?? 0, data: packet.data as Uint8Array<ArrayBuffer> }));
      } catch (error) { if (!stopped) fail(error instanceof Error ? error : new Error(String(error))); }
    },
    stop: () => { stopped = true; reset(); }
  };
};

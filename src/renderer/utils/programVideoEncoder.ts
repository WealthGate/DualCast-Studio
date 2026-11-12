import type { NativeCaptureFrame, VideoResolution } from "../../shared/types";
import { streamingCaptureSize } from "./streamingCapture";

// One hardware encoder serves every local display. Skip excess work before
// allocating a frame; never build an encoder queue of old Program pictures.
export const createProgramVideoEncoder = async (source: HTMLCanvasElement, fps: number, resolution: VideoResolution | undefined, send: (frame: NativeCaptureFrame) => void, fail: (error: Error) => void) => {
  const size = streamingCaptureSize(source.width, source.height, "low", resolution);
  const codec = size.width > 4096 ? "av01.0.17M.08" : size.width > 1920 || size.height > 1080 ? "avc1.420034" : "avc1.42002a";
  const bitrate = size.width > 4096 ? 80_000_000 : Math.round(Math.max(4_000_000, size.width * size.height * fps * 0.10));
  let selected: VideoEncoderConfig | null = null;
  const modes: HardwareAcceleration[] = size.width > 4096 ? ["prefer-hardware"] : ["prefer-hardware", "no-preference"];
  for (const hardwareAcceleration of modes) {
    const config: VideoEncoderConfig = { codec, width: size.width, height: size.height, framerate: fps, bitrate, latencyMode: "realtime", hardwareAcceleration,
      ...(codec.startsWith("avc1") ? { avc: { format: "annexb" as const } } : {}) };
    if ((await VideoEncoder.isConfigSupported(config)).supported) { selected = config; break; }
  }
  if (!selected) throw Error("The selected live-display resolution is not supported by this device's video encoder.");
  const canvas = document.createElement("canvas");canvas.width=size.width;canvas.height=size.height;
  const context = canvas.getContext("2d", {alpha:false});
  if(!context) throw Error("Live display capture is unavailable.");
  let active=true, lastKey=-Infinity, forceKey=true;
  const encoder = new VideoEncoder({ output: chunk => {
    if(!active)return;
    const data=new Uint8Array(chunk.byteLength);chunk.copyTo(data);
    send({id:"program",dataUrl:null,data,codec,keyFrame:chunk.type==="key",timestamp:chunk.timestamp});
  }, error: error => {if(active) fail(error);} });
  encoder.configure(selected);
  return {
    requestKeyFrame:()=>{forceKey=true;},
    draw:(now:number)=>{
      if(!active || encoder.state!=="configured" || encoder.encodeQueueSize>=2)return;
      context.drawImage(source,0,0,canvas.width,canvas.height);
      const frame=new VideoFrame(canvas,{timestamp:Math.round(now*1000)});
      const keyFrame=forceKey || now-lastKey>=500;
      if(keyFrame){lastKey=now;forceKey=false;}
      try{encoder.encode(frame,{keyFrame});}finally{frame.close();}
    },
    stop:()=>{active=false;if(encoder.state!=="closed")encoder.close();}
  };
};

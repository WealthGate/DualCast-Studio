import { spawn } from "child_process";

export type CaptureEncoder = "h264_qsv" | "h264_nvenc" | "h264_amf" | "libx264";
const encoderCache = new Map<string, Promise<CaptureEncoder[]>>();
const probe = (executable: string, encoder: CaptureEncoder) => new Promise<boolean>(resolve => {
  const child = spawn(executable, ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=size=320x180:rate=60", "-frames:v", "2", "-an", "-c:v", encoder, "-bf", "0", "-f", "null", "-"], { windowsHide: true });
  let done = false;
  const finish = (ok: boolean) => { if (done) return; done = true; clearTimeout(timer); resolve(ok); };
  const timer = setTimeout(() => { child.kill(); finish(false); }, 4000);
  child.stdout.resume(); child.stderr.resume();
  child.once("error", () => finish(false)); child.once("close", code => finish(code === 0));
});
export const availableCaptureEncoders = (executable: string) => {
  let result = encoderCache.get(executable);
  if (!result) {
    result = (async () => {
      const encoders: CaptureEncoder[] = ["h264_qsv", "h264_nvenc", "h264_amf"];
      const working = await Promise.all(encoders.map(async encoder => await probe(executable, encoder) ? encoder : null));
      return [...working.filter((encoder): encoder is CaptureEncoder => encoder !== null), "libx264" as const];
    })();
    encoderCache.set(executable, result);
  }
  return result;
};
export const selectCaptureEncoder = async (executable: string, preference = "auto") => {
  if (preference === "x264") return "libx264" as const;
  const encoders = await availableCaptureEncoders(executable);
  if (preference === "auto") return encoders[0];
  const selected = preference === "x264" ? "libx264" : `h264_${preference}`;
  if (encoders.includes(selected as CaptureEncoder)) return selected as CaptureEncoder;
  throw Error(`The selected ${preference.toUpperCase()} capture encoder is unavailable with this device and driver. Choose Automatic or another detected encoder in Settings.`);
};
export const h264CaptureArgs = (encoder: CaptureEncoder, fps: number) => [
  "-c:v", encoder,
  ...(encoder === "h264_qsv" ? ["-preset", "veryfast", "-look_ahead", "0", "-async_depth", "1", "-global_quality", "26"]
    : encoder === "h264_nvenc" ? ["-preset", "p1", "-tune", "ull", "-zerolatency", "1", "-qp", "24"]
    : encoder === "h264_amf" ? ["-usage", "ultralowlatency", "-quality", "speed"]
    : ["-preset", "ultrafast", "-tune", "zerolatency", "-crf", "24"]),
  "-profile:v", "baseline", "-bf", "0", "-g", String(Math.max(1, Math.round(fps / 2))),
  "-bsf:v", "h264_metadata=aud=insert", "-threads", "2", "-flush_packets", "1", "-f", "h264", "pipe:1"
];

// Access units start with AUD. Keep codec dependencies ordered; unlike JPEG,
// arbitrary delta frames cannot be replaced by a newer delta frame.
export const createH264Parser = (present: (data: Buffer, keyFrame: boolean, codec?: string) => void) => {
  let pending = Buffer.alloc(0);
  let codec: string | undefined;
  const audPositions = (data: Buffer) => {
    const positions: number[] = [];
    for (let i = 0; i + 4 < data.length; i++) {
      if (data[i] || data[i + 1]) continue;
      const prefix = data[i + 2] === 1 ? 3 : data[i + 2] === 0 && data[i + 3] === 1 ? 4 : 0;
      if (prefix && (data[i + prefix] & 31) === 9) { positions.push(i); i += prefix; }
    }
    return positions;
  };
  const packet = (data: Buffer) => {
    let keyFrame = false;
    for (let i = 0; i + 4 < data.length; i++) {
      if (data[i] || data[i + 1]) continue;
      const prefix = data[i + 2] === 1 ? 3 : data[i + 2] === 0 && data[i + 3] === 1 ? 4 : 0;
      if (!prefix) continue;
      const type = data[i + prefix] & 31;
      if (type === 5) keyFrame = true;
      if (type === 7 && i + prefix + 3 < data.length) codec = `avc1.${data.subarray(i + prefix + 1, i + prefix + 4).toString("hex")}`;
      i += prefix;
    }
    present(data, keyFrame, codec);
  };
  return {
    push: (chunk: Buffer) => {
      pending = Buffer.concat([pending, chunk]);
      if (pending.length > 16 * 1024 * 1024) throw Error("Capture bitstream exceeded its bounded packet size.");
      const positions = audPositions(pending);
      for (let i = 1; i < positions.length; i++) packet(pending.subarray(i === 1 ? 0 : positions[i - 1], positions[i]));
      if (positions.length > 1) pending = pending.subarray(positions[positions.length - 1]);
    },
    flush: () => { if (pending.length) packet(pending); pending = Buffer.alloc(0); }
  };
};

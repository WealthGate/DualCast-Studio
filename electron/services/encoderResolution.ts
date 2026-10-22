import { spawn } from "child_process";
import type { StreamingEncoder } from "../../src/shared/types";
import { buildEncoderProbeArgs } from "./streamingEncoder";

// Small capability probes do not establish an encoder's maximum dimensions.
// Validate an explicit 8K request asynchronously before opening network outputs.
export const supportsStreamResolution = (executable: string, encoder: StreamingEncoder, fps: number, vaapiDevice: string | null) => new Promise<boolean>(resolve => {
  const child = spawn(executable, buildEncoderProbeArgs(encoder, { vaapiDevice, width: 7680, height: 4320, fps }), { windowsHide: true });
  let done = false;
  const finish = (supported: boolean) => { if (done) return; done = true; clearTimeout(timer); resolve(supported); };
  const timer = setTimeout(() => { child.kill(); finish(false); }, 5000);
  child.stdout.resume(); child.stderr.resume();
  child.once("error", () => finish(false));
  child.once("close", code => finish(code === 0));
});

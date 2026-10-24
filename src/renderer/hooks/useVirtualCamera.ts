import { RefObject, useCallback, useEffect, useRef, useState } from "react";
import { VIRTUAL_CAMERA_FPS, VIRTUAL_CAMERA_HEIGHT, VIRTUAL_CAMERA_NAME, VIRTUAL_CAMERA_WIDTH, VirtualCameraStatus } from "../../shared/virtualCamera";

export function useVirtualCamera(program: RefObject<HTMLCanvasElement>) {
  const [status, setStatus] = useState<VirtualCameraStatus>({ supported: false, installed: false, state: "stopped", name: VIRTUAL_CAMERA_NAME });
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    const unsubscribe = window.dualcast.onVirtualCameraStatus(next => { if (mounted.current) setStatus(next); });
    void window.dualcast.getVirtualCameraStatus().then(next => { if (mounted.current) setStatus(next); }).catch(error => { if (mounted.current) setStatus(previous => ({ ...previous, state: "error", message: String(error) })); });
    return () => { mounted.current = false; unsubscribe(); void window.dualcast.configureVirtualCamera("stop").catch(() => undefined); };
  }, []);
  const configure = useCallback(async (action: "install" | "uninstall" | "start" | "stop") => {
    if (busy) return;
    setBusy(true);
    try { const next = await window.dualcast.configureVirtualCamera(action); if (mounted.current) setStatus(next); }
    catch (error) { if (mounted.current) setStatus(previous => ({ ...previous, state: "error", message: String(error) })); }
    finally { if (mounted.current) setBusy(false); }
  }, [busy]);
  useEffect(() => {
    if (status.state !== "running" || !status.session) return;
    const session = status.session;
    const canvas = document.createElement("canvas"); canvas.width = VIRTUAL_CAMERA_WIDTH; canvas.height = VIRTUAL_CAMERA_HEIGHT;
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) { void configure("stop"); return; }
    let disposed = false, inFlight = false;
    const capture = async () => {
      const source = program.current;
      if (disposed || inFlight || !source || !source.width || !source.height) return;
      inFlight = true;
      try {
        ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, canvas.height);
        const scale = Math.min(canvas.width / source.width, canvas.height / source.height);
        const width = source.width * scale, height = source.height * scale;
        ctx.drawImage(source, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
        const pixels = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const accepted = await window.dualcast.sendVirtualCameraFrame({ session, data: new Uint8Array(pixels.data.buffer) });
        if (!accepted && !disposed) throw Error("Virtual Camera stopped accepting Program frames.");
      } catch (error) {
        if (!disposed) {
          disposed = true;
          void window.dualcast.configureVirtualCamera("stop").catch(() => undefined).finally(() => {
            if (mounted.current) setStatus(previous => ({ ...previous, state: "error", session: undefined, message: String(error) }));
          });
        }
      } finally { inFlight = false; }
    };
    void capture();
    const timer = window.setInterval(() => { void capture(); }, 1000 / VIRTUAL_CAMERA_FPS);
    return () => { disposed = true; window.clearInterval(timer); };
  }, [program, status.state, status.session]);
  return { status, busy, configure };
}

export type VirtualCameraController = ReturnType<typeof useVirtualCamera>;

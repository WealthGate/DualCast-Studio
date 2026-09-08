// Bound encoding work to one frame; slow machines skip frames instead of queuing them.
export const createFrameEncoder = (send: (frame: string) => void, type = "image/jpeg", quality = 0.8) => {
  let busy = false;
  let stopped = false;
  return {
    stop: () => { stopped = true; },
    encode: (canvas: HTMLCanvasElement) => {
      if (busy || stopped || !canvas.width || !canvas.height) return;
      busy = true;
      try {
        canvas.toBlob((blob) => {
          if (!blob || stopped) { busy = false; return; }
          const reader = new FileReader();
          reader.onload = () => {
            busy = false;
            if (!stopped && typeof reader.result === "string") send(reader.result);
          };
          reader.onerror = () => { busy = false; };
          reader.readAsDataURL(blob);
        }, type, quality);
      } catch {
        busy = false;
      }
    }
  };
};

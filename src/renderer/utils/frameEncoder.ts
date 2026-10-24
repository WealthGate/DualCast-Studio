// One active encode and one latest canvas reference. Retry immediately when an
// encode finishes; waiting for the next render tick can halve delivery FPS.
export const createFrameEncoder = (send: (frame: string) => void, type = "image/jpeg", quality = 0.8) => {
  let busy = false;
  let stopped = false;
  let pending: HTMLCanvasElement | null = null;
  const finish = () => {
    busy = false;
    const next = pending;
    pending = null;
    if (next && !stopped) encode(next);
  };
  const encode = (canvas: HTMLCanvasElement) => {
      if (stopped || !canvas.width || !canvas.height) return;
      if (busy) { pending = canvas; return; }
      busy = true;
      try {
        const read = (blob: Blob | null) => {
          if (!blob || stopped) { finish(); return; }
          const reader = new FileReader();
          reader.onload = () => {
            try { if (!stopped && typeof reader.result === "string") send(reader.result); }
            finally { finish(); }
          };
          reader.onerror = finish;
          reader.readAsDataURL(blob);
        };
        canvas.toBlob(read, type, quality);
      } catch { finish(); }
  };
  return {
    isBusy: () => busy,
    stop: () => { stopped = true; pending = null; },
    encode
  };
};

export type DecodedFrame = HTMLImageElement | ImageBitmap;

// One active decode, one latest pending frame, and one explicitly owned bitmap.
// Unique data-URL Image resources otherwise accumulate in Chromium's image cache
// until a large garbage collection / GPU eviction interrupts every canvas.
export const createFrameDecoder = (draw: (image: DecodedFrame) => void) => {
  let busy = false;
  let stopped = false;
  let pending: { dataUrl: string; resolve: () => void } | null = null;
  let cancelActive: (() => void) | null = null;
  let releaseLatest: (() => void) | null = null;
  const start = (dataUrl: string, resolve: () => void) => {
    if (stopped) { resolve(); return; }
    if (busy) { pending?.resolve(); pending = { dataUrl, resolve }; return; }
    busy = true;
    let finished = false;
    let image: HTMLImageElement | null = null;
    const finish = () => {
      if (finished) return;
      finished = true;
      clearTimeout(timeout);
      if (image) { image.onload = null; image.onerror = null; }
      resolve();
      cancelActive = null;
      busy = false;
      if (pending && !stopped) {
        const next = pending; pending = null;
        start(next.dataUrl, next.resolve);
      }
    };
    const cancel = () => { if (image) { image.onload = null; image.onerror = null; image.src = ""; } finish(); };
    const timeout = setTimeout(cancel, 500);
    cancelActive = cancel;
    const present = (frame: DecodedFrame, release: () => void) => {
      if (stopped || finished) { release(); return; }
      try {
        draw(frame);
        releaseLatest?.();
        releaseLatest = release;
      } catch (error) { release(); console.error("Frame presentation failed", error); }
      finally { finish(); }
    };
    try {
      if (typeof createImageBitmap === "function" && dataUrl.startsWith("data:")) {
        const comma = dataUrl.indexOf(",");
        const encoded = dataUrl.slice(comma + 1);
        const fromBase64 = (Uint8Array as typeof Uint8Array & { fromBase64?: (value: string) => Uint8Array<ArrayBuffer> }).fromBase64;
        let bytes: Uint8Array<ArrayBuffer>;
        if (fromBase64) bytes = fromBase64(encoded);
        else {
          const binary = atob(encoded); bytes = new Uint8Array(binary.length);
          for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
        }
        const type = dataUrl.slice(5, dataUrl.indexOf(";"));
        void createImageBitmap(new Blob([bytes], { type })).then(bitmap => present(bitmap, () => bitmap.close()), finish);
      } else {
        image = new Image();
        const current = image;
        image.onload = () => present(current, () => { current.src = ""; });
        image.onerror = finish;
        image.src = dataUrl;
      }
    } catch { finish(); }
  };
  return {
    decode: (dataUrl: string) => new Promise<void>(resolve => start(dataUrl, resolve)),
    stop: () => {
      stopped = true; pending?.resolve(); pending = null;
      cancelActive?.(); releaseLatest?.(); releaseLatest = null;
    }
  };
};

// At most one decode and one pending (latest) frame. Out-of-order Image.onload
// callbacks must never move a live display backwards or build a frame backlog.
export const createFrameDecoder = (draw: (image: HTMLImageElement) => void) => {
  let busy = false;
  let stopped = false;
  let pending: { dataUrl: string; resolve: () => void } | null = null;
  let finishActive: (() => void) | null = null;
  const start = (dataUrl: string, resolve: () => void) => {
    if (stopped) { resolve(); return; }
    if (busy) { pending?.resolve(); pending = { dataUrl, resolve }; return; }
    busy = true;
    const image = new Image();
    const finish = () => {
      resolve();
      finishActive = null;
      busy = false;
      if (pending && !stopped) {
        const next = pending;
        pending = null;
        start(next.dataUrl, next.resolve);
      }
    };
    finishActive = resolve;
    image.onload = () => { try { if (!stopped) draw(image); } finally { finish(); } };
    image.onerror = finish;
    image.src = dataUrl;
  };
  const decode = (dataUrl: string) => new Promise<void>(resolve => start(dataUrl, resolve));
  return { decode, stop: () => { stopped = true; pending?.resolve(); pending = null; finishActive?.(); } };
};

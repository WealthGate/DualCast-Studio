// At most one decode and one pending (latest) frame. Out-of-order Image.onload
// callbacks must never move a live display backwards or build a frame backlog.
export const createFrameDecoder = (draw: (image: HTMLImageElement) => void) => {
  let busy = false;
  let stopped = false;
  let pending: string | null = null;
  const decode = (dataUrl: string) => {
    if (stopped) return;
    if (busy) { pending = dataUrl; return; }
    busy = true;
    const image = new Image();
    const finish = () => {
      busy = false;
      if (pending && !stopped) {
        const next = pending;
        pending = null;
        decode(next);
      }
    };
    image.onload = () => { if (!stopped) draw(image); finish(); };
    image.onerror = finish;
    image.src = dataUrl;
  };
  return { decode, stop: () => { stopped = true; pending = null; } };
};

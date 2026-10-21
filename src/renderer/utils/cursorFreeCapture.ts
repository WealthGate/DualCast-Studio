// Convert cursor-free native frames into the same MediaStream used by the
// compositor, so projection, recording and streaming share identical pixels.
export const getCursorFreeStream = async (sourceId: string): Promise<MediaStream | null> => {
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) throw new Error("Screen capture canvas is unavailable.");
  let id: string | null = null;
  let stopped = false;
  let decoding = false;
  let stream: MediaStream | null = null;
  let rejectReady: (error: Error) => void = () => undefined;
  let resolveReady: () => void = () => undefined;
  const ready = new Promise<void>((resolve, reject) => { resolveReady = resolve; rejectReady = reject; });
  const stop = () => {
    if (stopped) return;
    stopped = true;
    clearTimeout(timeout);
    unsubscribe();
    if (id) void window.dualcast.stopCursorFreeCapture(id).catch(() => undefined);
    stream?.getTracks().forEach((track) => track.stop());
  };
  const unsubscribe = window.dualcast.onCursorFreeFrame((frame) => {
    if (frame.id !== id || stopped) return;
    if (!frame.dataUrl) {
      rejectReady(new Error("Cursor-free screen capture ended."));
      stop();
      return;
    }
    if (decoding) return;
    decoding = true;
    const image = new Image();
    image.onload = () => {
      decoding = false;
      if (stopped) return;
      if (canvas.width !== image.width || canvas.height !== image.height) {
        canvas.width = image.width;
        canvas.height = image.height;
      }
      context.drawImage(image, 0, 0);
      resolveReady();
    };
    image.onerror = () => { decoding = false; };
    image.src = frame.dataUrl;
  });
  const timeout = setTimeout(() => {
    rejectReady(new Error("Cursor-free screen capture timed out."));
    stop();
  }, 10000);
  // Attach a handler immediately, including while awaiting the IPC response.
  void ready.catch(() => undefined);
  try {
    id = await window.dualcast.startCursorFreeCapture(sourceId);
    if (stopped) {
      if (id) void window.dualcast.stopCursorFreeCapture(id).catch(() => undefined);
      throw new Error("Cursor-free screen capture timed out.");
    }
    if (!id) { stop(); return null; }
    await ready;
    if (stopped) throw new Error("Cursor-free screen capture ended.");
    clearTimeout(timeout);
    stream = canvas.captureStream(30);
    for (const track of stream.getVideoTracks()) {
      const originalStop = track.stop.bind(track);
      track.stop = () => { originalStop(); stop(); };
    }
    return stream;
  } catch (error) {
    stop();
    throw error;
  }
};

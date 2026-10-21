// WebM chunks are dependent: preserve ordering and fail a stalled destination
// instead of dropping arbitrary chunks or delaying every other destination.
export const createMediaInputQueue = (write: (data: Buffer) => Promise<void>, fail: (error: Error) => void) => {
  let tail = Promise.resolve();
  let bytes = 0;
  let count = 0;
  let stopped = false;
  return {
    drain: () => tail,
    stop: () => { stopped = true; },
    enqueue: (data: Buffer) => {
      if (stopped) return;
      if (bytes + data.length > 4 * 1024 * 1024 || count >= 8) {
        stopped = true;
        fail(new Error("Stream destination cannot keep up. Its input queue was stopped before growing live delay; reduce quality or check the connection."));
        return;
      }
      bytes += data.length; count++;
      const queuedAt = Date.now();
      tail = tail.then(async () => {
        if (stopped) return;
        if (Date.now() - queuedAt > 1500) throw new Error("Stream destination input is more than 1.5 seconds behind live video.");
        await write(data);
      }).catch(error => {
        if (!stopped) { stopped = true; fail(error instanceof Error ? error : new Error(String(error))); }
      }).finally(() => { bytes -= data.length; count--; });
    }
  };
};

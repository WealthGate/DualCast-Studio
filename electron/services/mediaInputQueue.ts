// WebM chunks are dependent: preserve ordering and fail a stalled destination
// instead of dropping arbitrary chunks or delaying every other destination.
export const createMediaInputQueue = (
  write: (data: Buffer) => Promise<void>, fail: (error: Error) => void, maxBytes = 4 * 1024 * 1024,
  startup?: { timeoutMs: number; liveSince: () => number | null }
) => {
  let tail = Promise.resolve();
  let bytes = 0;
  let count = 0;
  let stopped = false;
  return {
    drain: () => tail,
    stop: () => { stopped = true; },
    enqueue: (data: Buffer) => {
      if (stopped) return;
      const starting = startup?.liveSince() === null;
      const byteLimit = starting ? Math.max(maxBytes, Math.min(32 * 1024 * 1024, maxBytes * 3)) : maxBytes;
      if (bytes + data.length > byteLimit || count >= (starting ? 48 : 8)) {
        stopped = true;
        fail(new Error("Stream destination cannot keep up. Its input queue was stopped before growing live delay; reduce quality or check the connection."));
        return;
      }
      bytes += data.length; count++;
      const queuedAt = Date.now();
      tail = tail.then(async () => {
        if (stopped) return;
        const liveSince = startup?.liveSince();
        const maxAge = liveSince === null ? startup!.timeoutMs : 1500;
        if (Date.now() - Math.max(queuedAt, liveSince ?? 0) > maxAge) throw new Error(liveSince === null
          ? "Stream startup timed out before the encoder produced video. Try another encoder or check the stream connection."
          : "Stream destination input is more than 1.5 seconds behind live video.");
        await write(data);
      }).catch(error => {
        if (!stopped) { stopped = true; fail(error instanceof Error ? error : new Error(String(error))); }
      }).finally(() => { bytes -= data.length; count--; });
    }
  };
};

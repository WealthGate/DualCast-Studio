// A display receives one frame at a time. While it decodes, retain only the
// latest replacement so a slow screen never accumulates IPC video history.
export const createLatestFrameRelay = (send: (payload: { sequence: number; dataUrl: string }) => void) => {
  let sequence = 0;
  let inFlight: number | null = null;
  let pending: string | null = null;
  let sentAt = 0;
  const offer = (dataUrl: string) => {
    if (inFlight !== null && Date.now() - sentAt < 1000) { pending = dataUrl; return; }
    pending = null;
    inFlight = ++sequence;
    sentAt = Date.now();
    send({ sequence, dataUrl });
  };
  return { offer, acknowledge: (value: number) => {
    if (value !== inFlight) return;
    inFlight = null;
    const next = pending; pending = null;
    if (next) offer(next);
  } };
};

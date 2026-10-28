// A cold TAKE may briefly hold the outgoing picture. A buffering overlay must
// never stop an already-live scene (or hold every other source indefinitely).
export const createSceneWarmup = (timeoutMs = 750) => {
  let current: unknown;
  let startedAt = 0;
  let live = false;
  return (scene: unknown, ready: boolean, now: number) => {
    if (current !== scene) { current = scene; startedAt = now; live = false; }
    if (ready || now - startedAt >= timeoutMs) live = true;
    return live;
  };
};

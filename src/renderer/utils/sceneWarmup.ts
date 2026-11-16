// Wait for a drawable picture. Once one is available, an unrelated slow layer
// can delay the handoff briefly but cannot hold every other source indefinitely.
export const createSceneWarmup = (timeoutMs = 750) => {
  let current: unknown;
  let startedAt = 0;
  let live = false;
  return (scene: unknown, ready: boolean, now: number, hasPicture = true) => {
    if (current !== scene) { current = scene; startedAt = now; live = false; }
    if (hasPicture && (ready || now - startedAt >= timeoutMs)) live = true;
    return live && hasPicture;
  };
};

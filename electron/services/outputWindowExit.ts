type OutputWindow = {
  isDestroyed: () => boolean; setOpacity: (opacity: number) => void;
  close: () => void;
  webContents: { executeJavaScript: (code: string) => Promise<unknown> };
};
export const createOutputWindowExit = () => {
  const pending = new Map<OutputWindow, { finish: () => void; cancel: () => void; promise: Promise<void> }>();
  return {
    cancel: (window: OutputWindow) => pending.get(window)?.cancel(),
    close: (window: OutputWindow, milliseconds = 450): Promise<void> => {
      if (window.isDestroyed()) return Promise.resolve();
      const existing = pending.get(window);
      if (existing) return existing.promise;
      const duration = Math.max(100, Math.min(3000, Number.isFinite(milliseconds) ? milliseconds : 450));
      let resolve = () => {}, timer: ReturnType<typeof setInterval>;
      const promise = new Promise<void>(done => { resolve = done; });
      const began = Date.now();
      const release = () => { clearInterval(timer); pending.delete(window); resolve(); };
      const finish = () => { release(); if (!window.isDestroyed()) window.close(); };
      const cancel = () => {
        release();
        if (!window.isDestroyed()) {
          window.setOpacity(1);
          void window.webContents.executeJavaScript("document.documentElement.getAnimations().forEach(animation => animation.cancel())").catch(() => undefined);
        }
      };
      pending.set(window, { finish, cancel, promise });
      // Linux window managers may ignore native opacity. The page also fades
      // its contents; closure is bounded even if its renderer stops responding.
      void window.webContents.executeJavaScript(`document.documentElement.animate([{opacity:1},{opacity:0}],{duration:${duration},easing:'ease-in-out',fill:'forwards'}).finished`).catch(() => undefined);
      timer = setInterval(() => {
        if (window.isDestroyed()) { release(); return; }
        const progress = Math.min(1, (Date.now() - began) / duration);
        if (process.platform !== "linux") window.setOpacity(1 - progress * progress * (3 - 2 * progress));
        if (progress >= 1) finish();
      }, 16);
      return promise;
    }
  };
};

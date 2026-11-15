module.exports = async function verifyFloatingDocks(window) {
  return window.webContents.executeJavaScript(`(async () => {
    const assert = (condition, message) => { if (!condition) throw Error(message); };
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const until = async query => {
      for (let i = 0; i < 80; i++) { const value = query(); if (value) return value; await wait(25); }
      throw Error('Timed out waiting for a floating dock.');
    };
    const locate = name => document.querySelector('button[aria-label="' + name + '"]');
    const panel = selector => document.querySelector(selector + ' [data-dock-panel-id="scenes"]');
    const original = (await until(() => panel('.dock-zone-left'))).firstElementChild;
    locate('Float Scenes').click();
    const floating = await until(() => document.querySelector('[aria-label="Floating Scenes"]'));
    assert(floating.querySelector('[data-dock-panel-id="scenes"]').firstElementChild === original, 'Floating remounted the panel.');
    assert(!panel('.dock-zone-left'), 'Scene panel appeared in two places.');
    const x = floating.offsetLeft, width = floating.offsetWidth;
    locate('Move Scenes').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await until(() => floating.offsetLeft > x);
    locate('Resize Scenes').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await until(() => floating.offsetWidth > width);
    const loaded = JSON.parse(localStorage.getItem('openchurch:floating-docks:v1'));
    assert(loaded[0]?.id === 'scenes' && loaded[0].width > width && loaded[0].x > x, 'Floating position and size were not saved.');
    locate('Dock Scenes').click();
    assert((await until(() => panel('.dock-zone-left'))).firstElementChild === original, 'Returning to the dock remounted the panel.');
    assert(!document.querySelector('[aria-label="Floating Scenes"]'), 'The floating panel did not close.');
    return { float: true, moved: true, resized: true, settingsSaved: true, redocked: true, preservedPanel: true };
  })()`);
};

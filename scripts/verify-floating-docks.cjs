// Exercise native pointer input with Chromium hit testing and pointer capture.
module.exports = async function verifyFloatingDocks(window) {
  const contents = window.webContents;
  const zones = ['top', 'left', 'right', 'bottom'];
  const setup = async zones => {
    const assert = (condition, message) => { if (!condition) throw Error(message); };
    const until = async (query, message) => {
      for (let i = 0; i < 80; i++) {
        const value = query();
        if (value) return value;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw Error(message);
    };
    const button = name => document.querySelector('button[aria-label="' + name + '"]');
    const scenes = () => document.querySelector('[data-dock-panel-id="scenes"]');
    const floating = () => document.querySelector('[aria-label="Floating Scenes"]');
    const audioGroup = () => document.querySelector('[data-dock-panel-id="audio"]').closest('.dock-group');
    const original = (await until(scenes, 'Scenes did not open')).firstElementChild;
    const checkPanel = node => {
      assert(node.firstElementChild === original, 'Changing docks remounted the panel.');
      assert(document.querySelectorAll('[data-dock-panel-id="scenes"]').length === 1, 'Scenes appeared twice.');
    };
    const center = element => {
      const rect = element.getBoundingClientRect();
      assert(rect.width > 0 && rect.height > 0, 'The drag target is empty.');
      return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
    };
    const locateTarget = target => {
      if (target === 'center') return document.querySelector('.studio-center');
      if (zones.includes(target)) return document.querySelector('.dock-edge-' + target);
      const selector = target === 'tab' ? '.dock-group-merge-target' : '.dock-group-split-target.after';
      return audioGroup().querySelector(selector);
    };
    const savedFloats = () => JSON.parse(localStorage.getItem('openchurch:floating-docks:v1') ?? '[]');
    const savedLayout = () => JSON.parse(localStorage.getItem('openchurch:dock-layout:v2'));
    const waitForTargetsHidden = () => until(() => !document.querySelector('.dock-drop-layer'), 'Docking targets did not close.');
    const checkDocked = async (zone, verifyGroup) => {
      const item = await until(() => scenes()?.closest('.dock-zone-' + zone) && scenes(), 'Scenes did not dock ' + zone + '.');
      checkPanel(item);
      assert(!floating(), 'Scenes remained floating after it docked.');
      await until(() => !savedFloats().some(panel => panel.id === 'scenes'), 'The floating record was not cleared.');
      const savedGroups = savedLayout()[zone];
      assert(savedGroups.some(group => group.panelIds.includes('scenes')), 'The new dock was not persisted.');
      if (verifyGroup) verifyGroup(item.closest('.dock-group'));
    };

    window.floatingDockTest = {
      async float() {
        (await until(() => button('Float Scenes'), 'Float Scenes button missing')).click();
        const panel = await until(floating, 'Scenes did not float.');
        checkPanel(panel.querySelector('[data-dock-panel-id="scenes"]'));
      },
      async keyboardMoveAndResize() {
        const panel = floating();
        const x = panel.offsetLeft, width = panel.offsetWidth;
        button('Move Scenes').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        await until(() => panel.offsetLeft > x, 'Keyboard move did not work.');
        button('Resize Scenes').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
        await until(() => panel.offsetWidth > width, 'Keyboard resize did not work.');
        await until(() => savedFloats().some(item => item.id === 'scenes' && item.width > width && item.x > x), 'Floating bounds were not saved.');
      },
      dragHandle: () => center(button('Move Scenes')),
      floatingPosition: () => ({ x: floating().offsetLeft, y: floating().offsetTop }),
      async dropTarget(target) {
        await until(() => document.querySelector('.dock-drop-layer'), 'Floating drag did not show docking targets.');
        assert(zones.every(zone => document.querySelector('.dock-edge-' + zone)), 'A workspace edge is missing.');
        const element = await until(() => locateTarget(target), 'Requested docking target is missing.');
        const point = center(element);
        assert(element.contains(document.elementFromPoint(point.x, point.y)), 'The drag position is obscured at ' + target + '.');
        return point;
      },
      async checkHover(target) {
        if (target === 'center') return;
        await until(() => locateTarget(target)?.hasAttribute('data-dock-drop-hover'), 'The docking target was not highlighted at ' + target + '.');
      },
      waitForTargetsHidden,
      async checkStillFloating(previous) {
        const panel = await until(floating, 'Dropping in the center unexpectedly docked the panel.');
        await until(() => panel.offsetLeft !== previous.x || panel.offsetTop !== previous.y, 'Pointer drag did not move the panel.');
        await waitForTargetsHidden();
        checkPanel(panel.querySelector('[data-dock-panel-id="scenes"]'));
      },
      focusReturn() {
        const control = button('Dock Scenes');
        control.focus();
        assert(document.activeElement === control, 'The return-to-dock control could not receive focus.');
      },
      checkHome: () => checkDocked('left'),
      checkDocked,
      checkTab: () => checkDocked('bottom', group => {
        assert(group === audioGroup(), 'Scenes did not join the Audio Mixer tab group.');
        assert(group.querySelector('#dock-tab-scenes').getAttribute('aria-selected') === 'true', 'The new Scenes tab is inactive.');
      }),
      checkSplit: () => checkDocked('bottom', group => {
        const groups = Array.from(group.parentElement.children).filter(item => item.classList.contains('dock-group'));
        assert(group !== audioGroup() && groups.indexOf(group) === groups.indexOf(audioGroup()) + 1, 'Scenes did not split alongside Audio Mixer.');
      })
    };
  };
  await contents.executeJavaScript(`(${setup.toString()})(${JSON.stringify(zones)})`);
  const call = (name, ...args) => contents.executeJavaScript(`window.floatingDockTest.${name}(...${JSON.stringify(args)})`);
  const mouse = (type, point, keepFloating = false) => {
    const modifiers = type === 'mouseMove' ? ['leftButtonDown'] : [];
    if (keepFloating) modifiers.push('control');
    contents.sendInputEvent({ type, x: point.x, y: point.y, button: 'left', clickCount: 1, modifiers });
  };
  const drag = async (target, keepFloating = false) => {
    const start = await call('dragHandle');
    let end = { x: start.x + 18, y: start.y };
    mouse('mouseDown', start);
    try {
      mouse('mouseMove', end);
      end = await call('dropTarget', target);
      mouse('mouseMove', end, keepFloating);
      await (keepFloating ? call('waitForTargetsHidden') : call('checkHover', target));
    } finally {
      mouse('mouseUp', end, keepFloating);
    }
  };
  try {
    contents.focus();
    await call('float');
    await call('keyboardMoveAndResize');
    const previous = await call('floatingPosition');
    await drag('center');
    await call('checkStillFloating', previous);
    await call('focusReturn');
    contents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' });
    contents.sendInputEvent({ type: 'keyUp', keyCode: 'Space' });
    await call('checkHome');

    for (const zone of zones) {
      await call('float');
      await drag(zone);
      await call('checkDocked', zone);
    }
    await call('float');
    await drag('tab');
    await call('checkTab');
    await call('float');
    await drag('split');
    await call('checkSplit');
    await call('float');
    const beforeModifierDrag = await call('floatingPosition');
    await drag('tab', true);
    await call('checkStillFloating', beforeModifierDrag);
    return { float: true, pointerMove: true, keyboardMoveAndResize: true, settingsSaved: true,
      keyboardReturn: true, edgeDrops: zones, tabDrop: true, splitDrop: true, modifierKeepsFloating: true, preservedPanel: true };
  } finally {
    await contents.executeJavaScript('delete window.floatingDockTest');
  }
};

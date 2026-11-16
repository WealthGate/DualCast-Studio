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
    const exposedPoint = (element, name) => {
      const rect = element.getBoundingClientRect();
      const viewport = { width: document.documentElement.clientWidth, height: document.documentElement.clientHeight };
      const axis = (start, end, limit) => {
        const first = Math.max(0, Math.ceil(start + 1));
        const last = Math.min(limit - 1, Math.floor(end - 1));
        if (last < first) return [];
        const middle = Math.round((first + last) / 2);
        const points = [middle];
        for (let offset = 5; middle - offset > first || middle + offset < last; offset += 5) {
          if (middle - offset > first) points.push(middle - offset);
          if (middle + offset < last) points.push(middle + offset);
        }
        return [...points, first, last];
      };
      const xs = axis(rect.left, rect.right, viewport.width);
      const ys = axis(rect.top, rect.bottom, viewport.height);
      const blockers = new Set();
      for (const y of ys) {
        for (const x of xs) {
          const hit = document.elementFromPoint(x, y);
          if (element.contains(hit)) return { x, y };
          if (blockers.size < 6 && hit) blockers.add(hit.id || hit.getAttribute('class') || hit.tagName);
        }
      }
      const workspace = document.querySelector('.dock-workspace');
      throw Error('No pointer-accessible point for ' + name + ': ' + JSON.stringify({
        rect: rect.toJSON(), viewport, scrollTop: workspace.scrollTop, scrollHeight: workspace.scrollHeight,
        blockers: [...blockers]
      }));
    };
    const paint = () => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
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
      async prepareDrag(target) {
        const group = target === 'center' ? document.querySelector('.studio-center')
          : target === 'tab' || target === 'split' ? audioGroup() : null;
        group?.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
        await paint();
        return exposedPoint(button('Move Scenes'), 'floating title');
      },
      async narrowViewport() {
        await until(() => innerWidth <= 1100 && innerHeight <= 730, 'The narrow viewport did not apply.');
        await paint();
        return { width: innerWidth, height: innerHeight };
      },
      async prepareAutoscroll() {
        const workspace = document.querySelector('.dock-workspace');
        workspace.scrollTop = 0;
        await paint();
        assert(workspace.scrollHeight > workspace.clientHeight, 'The narrow workspace has no area to scroll.');
        const rect = workspace.getBoundingClientRect();
        return {
          start: exposedPoint(button('Move Scenes'), 'floating title'),
          // Stay away from the explicit bottom docking target while holding the drag.
          end: { x: Math.round(rect.left + rect.width * 0.22), y: Math.round(rect.bottom - 18) },
          scrollTop: workspace.scrollTop
        };
      },
      checkAutoscroll: initialTop => until(() => {
        const movement = document.querySelector('.dock-workspace').scrollTop - initialTop;
        return movement >= 32 && movement;
      }, 'Holding a floating panel near the workspace edge did not scroll the dock area.'),
      floatingPosition: () => ({ x: floating().offsetLeft, y: floating().offsetTop }),
      async dropTarget(target) {
        await until(() => document.querySelector('.dock-drop-layer'), 'Floating drag did not show docking targets.');
        assert(zones.every(zone => document.querySelector('.dock-edge-' + zone)), 'A workspace edge is missing.');
        const element = await until(() => locateTarget(target), 'Requested docking target is missing.');
        return exposedPoint(element, target);
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
    const start = await call('prepareDrag', target);
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
    window.setContentSize(980, 700);
    const narrowViewport = await call('narrowViewport');
    await drag('tab');
    await call('checkTab');
    await call('float');
    await drag('split');
    await call('checkSplit');
    await call('float');
    const beforeAutoscroll = await call('floatingPosition');
    const { start, end, scrollTop } = await call('prepareAutoscroll');
    mouse('mouseDown', start);
    let autoscrollPixels;
    try {
      mouse('mouseMove', end);
      autoscrollPixels = await call('checkAutoscroll', scrollTop);
    } finally {
      mouse('mouseUp', end, true);
    }
    await call('checkStillFloating', beforeAutoscroll);
    return { float: true, pointerMove: true, keyboardMoveAndResize: true, settingsSaved: true,
      keyboardReturn: true, edgeDrops: zones, tabDrop: true, splitDrop: true, modifierKeepsFloating: true, preservedPanel: true, narrowViewport, autoscrollPixels };
  } finally {
    await contents.executeJavaScript('delete window.floatingDockTest');
  }
};

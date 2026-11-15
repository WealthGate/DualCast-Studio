module.exports = async function verifyAudioMixer(window) {
  const setup = await window.webContents.executeJavaScript(`(async () => {
    const { useAppStore: store } = await import('/store/useAppStore.ts');
    const assert = (value, message) => { if (!value) throw Error(message); };
    const until = async (check, message) => {
      for (let i = 0; i < 100; i++) {
        const value = check();
        if (value) return value;
        await new Promise(resolve => setTimeout(resolve, 25));
      }
      throw Error(message);
    };
    const byLabel = (label, root = document) => root.querySelector('[aria-label="' + label + '"]');
    const button = (text, root = document) => [...root.querySelectorAll('button')].find(item => item.textContent === text);
    const choose = (select, value) => { select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); };
    const tab = await until(() => [...document.querySelectorAll('[role="tab"]')].find(item => item.textContent.endsWith('Audio Mixer')), 'Audio Mixer tab missing');
    tab.click();
    const panel = await until(() => document.querySelector('.audio-mixer-panel'), 'Audio Mixer did not open');
    const program = byLabel('Master Program audio', panel);
    const bounds = program.getBoundingClientRect();
    assert(bounds.height >= 42 && bounds.width >= panel.clientWidth - 50, 'Program master is too small');
    assert(getComputedStyle(panel.firstElementChild).position === 'sticky', 'Master fader is not pinned');
    program.focus();
    window.checkMixer = { store, assert, until, byLabel, button, choose, panel, program };
    return { width: bounds.width, height: bounds.height };
  })()`, true);
  window.webContents.sendInputEvent({ type: "keyDown", keyCode: "Right" });
  window.webContents.sendInputEvent({ type: "keyUp", keyCode: "Right" });
  const result = await window.webContents.executeJavaScript(`(async () => {
    const { store, assert, until, byLabel, button, choose, panel, program } = window.checkMixer;
    await until(() => Number(program.value) > 1, 'Master fader did not respond to Right Arrow');
    const originalTrack = (await until(() => store.getState().programAudioStream, 'Program audio missing')).getAudioTracks()[0];
    const devices = navigator.mediaDevices;
    const originalGet = devices.getUserMedia.bind(devices);
    const originalEnumerate = devices.enumerateDevices.bind(devices);
    const captures = [];
    devices.enumerateDevices = async () => [
      { kind: 'audioinput', deviceId: 'usb-mixer', label: 'Two-channel interface' },
      { kind: 'audioinput', deviceId: 'singer-mic', label: 'USB microphone' }
    ];
    const context = new AudioContext({ sampleRate: 48000 });
    const merger = context.createChannelMerger(2);
    const output = context.createMediaStreamDestination();
    const oscillators = [440, 730].map((frequency, index) => {
      const oscillator = context.createOscillator(); oscillator.frequency.value = frequency;
      const gain = context.createGain(); gain.gain.value = index ? 0.1 : 0.2;
      oscillator.connect(gain).connect(merger, 0, index);
      oscillator.start();
      return oscillator;
    });
    merger.connect(output);
    await context.resume();
    devices.getUserMedia = constraints => {
      if (constraints.audio && !constraints.video) {
        captures.push(constraints.audio);
        return Promise.resolve(output.stream);
      }
      return originalGet(constraints);
    };
    const primary = byLabel('Primary microphone', panel);
    primary.querySelector('summary').click();
    const primaryDevice = byLabel('Primary microphone device', primary);
    await until(() => {
      const ready = [...primaryDevice.options].some(option => option.value === 'usb-mixer');
      if (!ready) devices.dispatchEvent(new Event('devicechange'));
      return ready;
    }, 'Device picker did not update');
    choose(primaryDevice, 'usb-mixer');
    choose(byLabel('Primary microphone channel', primary), '1');
    button('Radio Gold', primary).click();
    button('Add input line', panel).click();
    const second = await until(() => byLabel('Input 2', panel), 'Adding a second line did not show it');
    assert(byLabel('Mute Input 2', second).getAttribute('aria-pressed') === 'true', 'A new line went live before setup');
    const name = byLabel('Input 2 name', second);
    await until(() => document.activeElement === name, 'The new line did not focus its name');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(name, 'Keyboard');
    name.dispatchEvent(new Event('input', { bubbles: true }));
    name.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
    await until(() => byLabel('Keyboard', panel), 'Input name did not save');
    choose(byLabel('Keyboard device', second), 'usb-mixer');
    choose(byLabel('Keyboard channel', second), '2');
    button('Choir', second).click();
    byLabel('Mute Keyboard', second).click();
    const mode = panel.querySelector('.mixer-routing select');
    choose(mode, 'both');
    await until(() => captures.length === 1, 'Mic and instrument did not open their shared device');
    await until(() => parseFloat(second.querySelector('.meter-left').style.width) > 55, 'Instrument level did not reach Program');
    assert(primary.querySelector('.meter-left').style.width !== '0%', 'Primary signal did not reach the mixer');
    assert(captures.length === 1 && captures[0].deviceId.exact === 'usb-mixer', 'The same interface opened more than once');
    assert(button('Radio Gold', primary).getAttribute('aria-pressed') === 'true' &&
      button('Choir', second).getAttribute('aria-pressed') === 'true', 'Input presets were not independent');
    byLabel('Mute Keyboard', second).click();
    await until(() => parseFloat(second.querySelector('.meter-left').style.width) === 0, 'Mute did not silence Keyboard');
    assert(captures.length === 1 && parseFloat(primary.querySelector('.meter-left').style.width) > 55, 'Keyboard mute disrupted the mic');
    assert(store.getState().programAudioStream.getAudioTracks()[0] === originalTrack, 'Mixer edits replaced the Program output track');
    const saved = structuredClone(store.getState().settings);
    assert(saved.audioInputLines[0].name === 'Keyboard' && saved.audioInputLines[0].channel === 2 &&
      saved.audioInputLines[0].preset === 'choir', 'Line settings did not reach the settings bridge');
    byLabel('Float Audio Mixer').click();
    const floating = await until(() => byLabel('Floating Audio Mixer'), 'Audio Mixer could not float');
    assert(floating.contains(panel) && panel.scrollWidth <= panel.clientWidth + 2, 'Mixer layout overflowed or remounted in a floating dock');
    byLabel('Dock Audio Mixer').click();
    if (!second.querySelector('details').open) second.querySelector('summary').click();
    byLabel('Remove Keyboard', second).click();
    await until(() => !byLabel('Keyboard', panel), 'Remove line did not remove Keyboard');
    choose(mode, 'none');
    await until(() => output.stream.getAudioTracks()[0].readyState === 'ended', 'Mute all did not release the input capture');
    oscillators.forEach(oscillator => oscillator.stop());
    await context.close();
    devices.getUserMedia = originalGet;
    devices.enumerateDevices = originalEnumerate;
    return { savedLines: saved.audioInputLines, independentPresets: true, numberedInputs: true, sharedCapture: true, floatingMixer: true, stableProgramTrack: true };
  })()`, true);
  const settings = require("../tmp/schedule-settings-verification.cjs");
  const assert = require("node:assert/strict");
  settings.updateSettings({ audioInputLines: result.savedLines });
  assert.deepEqual(settings.getSettings().audioInputLines, result.savedLines);
  const { app } = require("electron");
  const persisted = require(require("node:path").join(app.getPath("userData"), "config.json"));
  assert.deepEqual(persisted.audioInputLines, result.savedLines);
  const { savedLines, ...checks } = result;
  return { masterFader: setup, inputSettingsPersisted: true, ...checks };
};

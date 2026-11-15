module.exports = async function verifyStudioUsability(window) {
  return window.webContents.executeJavaScript(`(async () => {
    const { useAppStore: store } = await import('/store/useAppStore.ts');
    const until = async (check, message) => {
      for (let attempt = 0; attempt < 100; attempt++) {
        const result = check();
        if (result) return result;
        await new Promise(resolve => setTimeout(resolve, 30));
      }
      throw Error(message);
    };
    const assert = (result, message) => { if (!result) throw Error(message); };
    const button = (label, parent = document) => [...parent.querySelectorAll('button')].find(item => item.textContent.trim() === label);
    const change = (input, value) => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const lower = () => store.getState().settings.lowerThird;
    const fixtureSlide = { id: 'service:other:live:0', deckId: 'service:other:live', deckTitle: 'Current song', kind: 'song', text: 'Keep the current lyric on air' };
    const sermon = { id: 'sermon-item', title: 'Sunday Sermon', kind: 'slides', notes: '', minutes: 25, slides: [
      { id: 'point-one', kind: 'text', text: 'Introduction' }, { id: 'point-two', kind: 'text', text: 'Care for your neighbor' }
    ] };
    const note = { id: 'operator-note', title: 'Sermon cue notes', kind: 'note', notes: 'Operator-only microphone reminder', minutes: 1 };
    (await until(() => button('View'), 'View menu missing')).click();
    (await until(() => [...document.querySelectorAll('.menu-command')].find(item => item.textContent.trim().startsWith('Program Focus')), 'Program Focus missing')).click();
    await until(() => document.querySelector('.app-shell.program-focus-mode'), 'Program Focus did not open');
    await store.getState().updateSettings({ theme: 'dark', scriptureSourceId: 'test-offline', lowerThird: {
      ...lower(), slides: [fixtureSlide], programSlideId: fixtureSlide.id, activeSlideId: fixtureSlide.id, showOnProgram: true
    }, serviceSchedules: [{ id: 'sunday', name: 'Sunday service', date: '', items: [sermon, note] }] });
    window.dualcast.listSongs = async () => [{ id: 'song-1', title: 'Evening Hymn', lyrics: 'Walk together in hope\\n\\nRaise your voices' }];
    let lookedUp;
    window.dualcast.lookupScriptureLibrary = async request => {
      lookedUp = request;
      return { reference: 'John 3:16', text: '<i>For God so loved the world</i> &lt;>' };
    };
    const modal = () => document.querySelector('.service-finder[open]');
    const start = async (query, keyboard = false) => {
      if (keyboard) window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, cancelable: true }));
      else (await until(() => button('Find in Service'), 'Finder button missing')).click();
      const finder = await until(modal, 'Finder did not open');
      const input = finder.querySelector('input[type=search]');
      assert(document.activeElement === input, 'Finder did not focus search');
      change(input, query);
      return finder;
    };
    let finder = await start('care for your neighbor', true);
    const cue = await until(() => button('Cue in Preview', finder), 'Sermon slide could not be found by text');
    assert(finder.querySelector('select[aria-label="Slide in Sunday Sermon"]').value === '1', 'Finder did not preselect the matching slide');
    cue.click();
    await until(() => !modal(), 'Cue did not complete');
    assert(lower().programSlideId === fixtureSlide.id && lower().slides.some(slide => slide.id === fixtureSlide.id), 'Cue removed or changed the on-air lyric');
    assert(lower().slides.find(slide => slide.id === lower().activeSlideId)?.text === 'Care for your neighbor', 'Wrong sermon slide cued');
    assert(document.querySelector('.app-shell.studio-mode'), 'Cue did not show the Preview workspace');
    finder = await start('microphone reminder');
    await until(() => finder.querySelector('.finder-note')?.textContent.includes(note.notes), 'Operator note not searchable by body');
    assert(!button('Show live', finder), 'An operator note could be sent live');
    button('Close', finder).click();
    await until(() => !modal(), 'Note search did not close');
    finder = await start('Care for your neighbor');
    (await until(() => button('Show live', finder), 'Scheduled sermon is unavailable')).click();
    await until(() => store.getState().liveScheduleCue?.itemId === sermon.id && !modal(), 'Schedule did not follow the finder live cue');
    assert(store.getState().liveScheduleCue.slide === 1, 'Schedule cursor did not follow the selected slide');
    finder = await start('Raise your voices');
    (await until(() => button('Show live', finder), 'Imported lyrics not searchable')).click();
    await until(() => !modal(), 'Song did not go live');
    const liveSong = lower().programSlideId;
    assert(lower().slides.find(slide => slide.id === liveSong)?.text === 'Raise your voices', 'Finder sent the wrong lyric live');
    finder = await start('John 3:16–18');
    (await until(() => button('Look up John 3:16–18 in Preview', finder), 'Scripture lookup missing')).click();
    await until(() => !modal(), 'Scripture lookup did not finish');
    assert(lookedUp?.libraryId === 'test-offline' && lookedUp.reference === 'John 3:16-18', 'Finder bypassed the selected offline Bible or failed to normalize the range');
    const verse = lower().slides.find(slide => slide.id === lower().activeSlideId);
    assert(verse?.text === 'For God so loved the world' && lower().programSlideId === liveSong, 'Scripture markup leaked or the lyric changed while cueing');

    const panels = button('Panels');
    assert(panels, 'Panels menu missing');
    panels.click();
    const menu = await until(() => document.querySelector('[role=menu][aria-label="Dock menu"]'), 'Panels menu did not open');
    assert(menu.contains(document.activeElement), 'Panels menu did not receive keyboard focus');
    const before = document.activeElement;
    before.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
    assert(document.activeElement !== before && menu.contains(document.activeElement), 'Panel menu arrow navigation failed');
    (button('System Settings', menu) ?? button('Show System Settings', menu)).click();
    const chooser = await until(() => document.querySelector('.theme-chooser'), 'Settings did not open');
    const choices = [...chooser.querySelectorAll('.theme-choice')];
    assert(choices.length === 9, 'Expected eight themes and System');
    const backgrounds = new Set();
    const toolbar = document.querySelector('.studio-toolbar');
    for (const id of ['dark', 'light', 'midnight', 'warm', 'forest', 'mulberry', 'sandstone', 'high-contrast']) {
      const index = ['system','dark','light','midnight','warm','forest','mulberry','sandstone','high-contrast'].indexOf(id);
      choices[index].click();
      await until(() => document.documentElement.dataset.theme === id, 'Theme did not apply: ' + id);
      backgrounds.add(getComputedStyle(toolbar).backgroundColor);
      assert(store.getState().settings.theme === id, 'Theme was not saved to settings: ' + id);
    }
    assert(backgrounds.size === 8, 'Theme choices did not visibly change studio controls');

    finder = await start('');
    button('Audio Mixer', finder).click();
    await until(() => !modal(), 'Audio mixer shortcut did not close Finder');
    (await until(() => button('VST effects'), 'VST effects shortcut is missing')).click();
    assert(document.activeElement?.getAttribute('aria-label') === 'VST effects', 'VST shortcut did not focus the insert');
    return { keyboardFinder: true, sermonSlide: true, privateNote: true, localLyrics: true, offlineScripture: true, cueKeptProgram: true, themes: backgrounds.size, panelsMenu: true, vstShortcut: true };
  })()`, true);
};

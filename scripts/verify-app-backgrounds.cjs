// Real Electron acceptance: managed uploads, output routing, animated bands and shutdown.
const path = require('node:path'), fs = require('node:fs');
const { spawn, spawnSync } = require('node:child_process');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const temp = path.join(root, 'tmp/background-verification');
if (!process.versions.electron) {
  (async () => {
    fs.mkdirSync(temp, { recursive: true });
    const ffmpeg = require('ffmpeg-static');
    for (const color of ['red', 'blue']) {
      const result = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', `color=c=${color}:s=320x180`, '-frames:v', '1', path.join(temp, `${color}.png`)], { windowsHide: true });
      assert.equal(result.status, 0, result.stderr.toString());
    }
    const video = spawnSync(ffmpeg, ['-hide_banner', '-loglevel', 'error', '-y', '-f', 'lavfi', '-i', 'testsrc2=size=320x180:rate=30', '-t', '2', '-an', '-c:v', 'libvpx', '-deadline', 'realtime', '-cpu-used', '8', path.join(temp, 'loop.webm')], { windowsHide: true });
    assert.equal(video.status, 0, video.stderr.toString());
    fs.writeFileSync(path.join(temp, 'entry.ts'), [
      'export * from "../../electron/services/ipc";', 'export * from "../../electron/services/settingsService";',
      'export * from "../../electron/services/audioPluginService";', 'export * from "../../electron/services/backgroundMediaService";',
      'export * from "../../electron/services/projectionService";', 'export * from "../../electron/services/virtualCameraService";',
      'export * from "../../electron/services/updateService";'
    ].join('\n'));
    await require('esbuild').build({ entryPoints: [path.join(temp, 'entry.ts')], bundle: true, platform: 'node', format: 'cjs', external: ['ffmpeg-static', 'fluent-ffmpeg'], outfile: path.join(root, 'tmp/background-services.cjs'), plugins: [{ name: 'electron-test', setup(build) {
      build.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron-test', namespace: 'test' }));
      build.onLoad({ filter: /.*/, namespace: 'test' }, () => ({ contents: 'module.exports=global.__backgroundTestElectron;', loader: 'js' }));
    } }] });
    const { build } = await import('vite');
    await build({ configFile: path.join(root, 'vite.config.mts'), build: { outDir: path.join(temp, 'renderer') }, plugins: [{ name: 'test-store-inspection', transform(code, id) {
      if (id.replace(/\\/g, '/').endsWith('/store/useAppStore.ts')) return code + '\nwindow.__backgroundTestStore = useAppStore;';
    } }] });
    fs.copyFileSync(path.join(root, 'dist-electron/preload.js'), path.join(root, 'tmp/preload.js'));
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE; delete env.VITE_DEV_SERVER_URL;
    let electron;
    try {
      electron = spawn(require('electron'), [__filename], { cwd: root, env, windowsHide: true, stdio: 'inherit' });
      const exit = await new Promise(resolve => electron.once('exit', resolve)); assert.equal(exit, 0);
    } finally { electron?.kill(); }
  })().catch(error => { console.error(error); process.exitCode = 1; });
} else {
  const electron = require('electron'), { app, BrowserWindow, dialog } = electron;
  app.setAppPath(root); app.setPath('userData', path.join(temp, `profile-${process.pid}`));
  app.on('window-all-closed', () => {});
  process.on('uncaughtException', error => { console.error('UNCAUGHT SHUTDOWN FAILURE', error); app.exit(1); });
  app.whenReady().then(async () => {
    const displays = [101, 202].map((id, index) => ({ id, label: `Test display ${index + 1}`, bounds: { x: index * 1000, y: 0, width: 800, height: 600 }, size: { width: 800, height: 600 }, scaleFactor: 1, rotation: 0 }));
    function HiddenWindow(options) {
      // Return real BrowserWindow objects: Electron's getAllWindows filters by
      // constructor identity and would omit subclasses from shutdown broadcasts.
      const window = new BrowserWindow({ ...options, show: false, alwaysOnTop: false, webPreferences: { ...options.webPreferences, offscreen: true } });
      window.show = () => {};
      window.showInactive = () => {};
      window.setBounds = bounds => { window.testDisplayId = bounds.x === 0 ? '101' : '202'; };
      return window;
    }
    Object.setPrototypeOf(HiddenWindow, BrowserWindow);
    global.__backgroundTestElectron = { ...electron, BrowserWindow: HiddenWindow, screen: { ...electron.screen, getAllDisplays: () => displays, getPrimaryDisplay: () => displays[0] } };
    const services = require('../tmp/background-services.cjs');
    const studio = new HiddenWindow({ width: 1400, height: 900, webPreferences: { preload: path.join(root, 'tmp/preload.js'), contextIsolation: true, backgroundThrottling: false } });
    const studioContents = studio.webContents;
    services.registerIpcHandlers(); services.registerAudioPluginIpc(studio.webContents); services.registerBackgroundMediaIpc(studio.webContents); services.registerVirtualCameraIpc(studio.webContents);
    let bandFrameCount = 0;
    electron.ipcMain.on('dualcast:lower-third-frame', event => { if (event.sender === studioContents) bandFrameCount++; });
    services.updateSettings({ qualityPreset: 'low', outputResolution: '720p', frameRate: 30, audioMode: 'none', networkOutput: { enabled: false, port: 8787, operatorPin: '' }, sanctuaryDisplay: { ...services.getSettings().sanctuaryDisplay, mode: 'independent' } });
    const js = code => studio.webContents.executeJavaScript(code, true);
    async function until(predicate, label, milliseconds = 12000) { const end = Date.now() + milliseconds; while (!await predicate()) { if (Date.now() > end) throw Error('Timed out: ' + label); await wait(80); } }
    const click = text => js(`(()=>{const b=[...document.querySelectorAll(${JSON.stringify(/\.(png|webm)$/.test(text) ? '.background-media-choice' : '.backgrounds-panel button')})].find(b=>b.textContent.includes(${JSON.stringify(text)}));if(!b||b.matches(':disabled'))throw Error('Unavailable button: '+${JSON.stringify(text)});b.click();})()`);
    async function chooseTarget(target) { await js(`document.querySelector('[data-background-target="'+${JSON.stringify(target)}+'"]')?.click()`); await until(() => js(`document.querySelector('[data-background-target="'+${JSON.stringify(target)}+'"]')?.getAttribute('aria-pressed')==='true'`), 'choose target '+target); await wait(100); }
    async function changeField(label, value, input = false) {
      await js(`(()=>{const e=document.querySelector('[aria-label="'+${JSON.stringify(label)}+'"]');Object.getOwnPropertyDescriptor(${input ? 'HTMLInputElement' : 'HTMLSelectElement'}.prototype,'value').set.call(e,${JSON.stringify(value)});e.dispatchEvent(new Event('${input ? 'input' : 'change'}',{bubbles:true}));})()`); await wait(100);
    }
    async function apply() { await click('Apply background'); await until(() => js(`document.querySelector('.backgrounds-panel [role="status"]')?.textContent.includes('Background applied')`), 'background save'); await wait(400); }
    const programPixel = () => js(`(()=>{const c=document.querySelector('.program-pane canvas');return [...c.getContext('2d').getImageData(c.width*.03,c.height*.94,1,1).data];})()`);
    try {
      dialog.showOpenDialog = async (...args) => { const options = args.at(-1); return { canceled: false, filePaths: options.filters[0].name === 'Images' ? ['red.png', 'blue.png'].map(name => path.join(temp, name)) : [path.join(temp, 'loop.webm')] }; };
      await studio.loadFile(path.join(temp, 'renderer/index.html'));
      await js(`window.testStore=window.__backgroundTestStore;if(!window.testStore)throw Error('Test store unavailable');`);
      studio.webContents.send('dualcast:app-command', 'open-backgrounds');
      await until(() => js(`Boolean(document.querySelector('.backgrounds-panel'))`), 'central editor');
      await until(() => js(`document.querySelector('[data-background-target="display:202"]')?.getAttribute('aria-pressed')==='true'`), 'external screen selected by default');
      await click('Manage display outputs');
      await until(() => js(`Boolean(document.querySelector('[data-dock-panel-id="displays"].active'))`), 'display selector opened');
      await until(() => js(`document.querySelectorAll('.sanctuary-displays-panel .display-target-option').length===2`), 'connected screens detected on independent startup');
      assert.ok(await js(`document.querySelector('.sanctuary-displays-panel .display-target-grid').getBoundingClientRect().height>=50`), 'connected screens must be visible in Independent Layout before switching to Mirror Program');
      assert.ok(await js(`(()=>{const box=document.querySelector('.display-target-option input[value="101"]'),r=box.getBoundingClientRect();return document.elementFromPoint(r.x+r.width/2,r.y+r.height/2)===box&&!box.disabled})()`), 'screen checkbox is visible and selectable in Independent Layout');
      await js(`document.querySelector('.display-target-option input[value="101"]').click();document.querySelector('.display-target-option input[value="202"]').click()`);
      await until(() => js(`JSON.stringify(window.testStore.getState().projectionTargetIds)==='["101"]'`), 'choose a screen in independent mode');
      await changeField('Sanctuary text source', 'custom');
      assert.ok(await js(`document.querySelector('.sanctuary-displays-panel .display-target-grid').getBoundingClientRect().height>=50`), 'extra custom text controls cannot collapse screen choices');
      fs.writeFileSync(path.join(temp, 'connected-displays-independent.png'), (await studio.webContents.capturePage()).toPNG());
      await changeField('Sanctuary display mode', 'program');
      await until(() => js(`window.testStore.getState().settings.sanctuaryDisplay.mode==='program'`), 'switch to Mirror Program');
      assert.ok(await js(`document.querySelector('.sanctuary-displays-panel .display-target-grid').getBoundingClientRect().height>=50`), 'screen list remains visible in Mirror Program');
      assert.deepEqual(await js(`window.testStore.getState().projectionTargetIds`), ['101'], 'mode changes preserve the chosen display');
      await changeField('Sanctuary display mode', 'independent');
      await until(() => js(`window.testStore.getState().settings.sanctuaryDisplay.mode==='independent'`), 'switch back to independent mode');
      displays.push({ ...displays[1], id: 303, label: 'Side screen', bounds: { ...displays[1].bounds, x: 2000 } });
      studioContents.send('dualcast:projection-displays-changed');
      await until(() => js(`document.querySelectorAll('.sanctuary-displays-panel .display-target-option').length===3`), 'newly connected screen appears without changing mode');
      await js(`document.querySelector('.display-target-option input[value="303"]').click()`);
      await until(() => js(`window.testStore.getState().projectionTargetIds.includes('303')`), 'new screen is selectable');
      displays.pop(); studioContents.send('dualcast:projection-displays-changed');
      await until(() => js(`document.querySelectorAll('.sanctuary-displays-panel .display-target-option').length===2&&!window.testStore.getState().projectionTargetIds.includes('303')`), 'disconnected screen removed from selection');
      assert.deepEqual(await js(`window.testStore.getState().projectionTargetIds`), ['101']);
      assert.equal(await js(`document.querySelectorAll('#lowerThirdDisplay option').length`), 3, 'lower-third screen selector is populated in independent mode');
      await js(`document.querySelector('.sanctuary-displays-panel > .btn-primary').click()`);
      await until(() => js(`window.testStore.getState().isProjecting`), 'independent layout opens on the chosen display');
      await js(`document.querySelector('.sanctuary-displays-panel > .btn-primary').click()`);
      await until(() => js(`!window.testStore.getState().isProjecting`), 'independent output closes');
      await changeField('Sanctuary display mode', 'program');
      await until(() => js(`window.testStore.getState().settings.sanctuaryDisplay.mode==='program'`), 'restore mirror for remaining background checks');
      studio.webContents.send('dualcast:app-command', 'open-backgrounds');
      await until(() => js(`Boolean(document.querySelector('[data-dock-panel-id="backgrounds"].active'))`), 'return to backgrounds');
      await click('Identify screens');
      await until(() => BrowserWindow.getAllWindows().filter(window => window.getTitle().startsWith('OpenChurch Screen')).length === 2, 'screen identifiers');
      const identifiers = BrowserWindow.getAllWindows().filter(window => window.getTitle().startsWith('OpenChurch Screen'));
      for (const identifier of identifiers) assert.equal(await identifier.webContents.executeJavaScript(`document.querySelector('strong').textContent`), identifier.getTitle().slice(-1));
      await until(() => BrowserWindow.getAllWindows().every(window => !window.getTitle().startsWith('OpenChurch Screen')), 'screen identifiers close automatically');
      await assert.rejects(() => services.openProjectionWindows(['disconnected']), /connected screen/);
      await assert.rejects(() => services.openLowerThirdWindow('disconnected'), /disconnected/);
      await click('Upload images'); await until(() => js(`document.querySelector('.background-library').textContent.includes('blue.png')`), 'image upload');
      assert.match(await js(`document.querySelector('.backgrounds-panel [role="status"]').textContent`), /Uploaded 2 files/);
      assert.equal(services.getSettings().displayBackgrounds.program, undefined, 'uploading does not change live Program');
      await click('Upload videos'); await until(() => js(`document.querySelector('.background-library').textContent.includes('loop.webm')`), 'video upload');
      assert.equal(services.listBackgroundMedia().length, 3);
      await changeField('Filter uploaded backgrounds', 'video');
      assert.equal(await js(`document.querySelectorAll('.background-media-choice').length`), 2);
      await until(() => js(`document.querySelector('.background-thumbnail video')?.readyState>=2`), 'video thumbnail decodes');
      await changeField('Filter uploaded backgrounds', 'all'); await changeField('Search uploaded backgrounds', 'BLUE', true);
      assert.equal(await js(`document.querySelectorAll('.background-media-choice').length`), 2);
      await changeField('Search uploaded backgrounds', '', true);
      fs.renameSync(path.join(temp, 'red.png'), path.join(temp, 'red-original-moved.png'));
      await chooseTarget('program'); await click('red.png'); await apply();
      let pixel = await programPixel(); assert.ok(pixel[0] > 240 && pixel[1] < 12, `managed Program image: ${pixel}`);
      await chooseTarget('display:101'); await click('blue.png');
      assert.equal(services.getSettings().displayBackgrounds.displays['101'], undefined, 'choosing a file only updates the draft');
      await click('Apply & show on Screen 1');
      await until(() => js(`document.querySelector('.backgrounds-panel [role="status"]')?.textContent.includes('Output opened')`), 'apply and show');
      assert.equal(await js(`window.testStore.getState().isProjecting`), true);
      assert.deepEqual(await js(`window.testStore.getState().projectionTargetIds`), ['101']);
      await js(`window.testStore.setState({projectionTargetIds:['101','202']})`);
      await services.openProjectionWindows(['101', '202']); await wait(1500);
      const outputs = BrowserWindow.getAllWindows().filter(window => window !== studio && window.webContents.getURL().includes('projection=program'));
      const first = outputs.find(window => window.testDisplayId === '101'), second = outputs.find(window => window.testDisplayId === '202'); assert.ok(first && second, JSON.stringify(BrowserWindow.getAllWindows().map(window => ({ id: window.id, display: window.testDisplayId, url: window.webContents.getURL(), ctor: window.constructor.name }))));
      const firstState = services.getProgramState(first.webContents), secondState = services.getProgramState(second.webContents);
      assert.equal(firstState.sanctuary.background.assetId, services.listBackgroundMedia().find(item => item.name === 'blue.png').id);
      assert.equal(secondState.sanctuary.settings.mode, 'program');
      assert.equal(await first.webContents.executeJavaScript(`document.querySelector('.sanctuary-layout img')?.complete`), true);
      assert.equal(await second.webContents.executeJavaScript(`Boolean(document.querySelector('.projection-canvas'))`), true);
      const bluePixel = await first.webContents.executeJavaScript(`(()=>{const image=document.querySelector('.sanctuary-layout img'),c=document.createElement('canvas');c.width=c.height=1;c.getContext('2d').drawImage(image,0,0,1,1);return [...c.getContext('2d').getImageData(0,0,1,1).data];})()`);
      assert.ok(bluePixel[2] > 240 && bluePixel[0] < 12, 'custom display receives its blue background');
      await until(async () => second.webContents.executeJavaScript(`(()=>{const c=document.querySelector('.projection-canvas'),v=document.querySelector('.projection-video'),s=document.createElement('canvas');s.width=s.height=1;const ctx=s.getContext('2d');if(v?.readyState>=2)ctx.drawImage(v,0,0,1,1);else ctx.drawImage(c,0,0,1,1);const p=ctx.getImageData(0,0,1,1).data;return p[0]>230&&p[1]<15;})()`), 'second display keeps the red Program picture');
      await chooseTarget('sanctuary'); await click('red.png'); await apply();
      assert.equal(services.getProgramState(first.webContents).sanctuary.background.assetId, services.listBackgroundMedia().find(item => item.name === 'blue.png').id, 'own assignment wins over shared background');
      assert.equal(services.getProgramState(second.webContents).sanctuary.settings.mode, 'independent', JSON.stringify({ saved: services.getSettings().displayBackgrounds, state: services.getProgramState(second.webContents).backgrounds, ui: await js(`document.querySelector('.background-selection-summary').textContent`) }));
      await click('Restore existing layout'); await wait(400);
      await click('Manage display outputs');
      await changeField('Sanctuary display mode', 'program');
      await until(() => services.getProgramState(first.webContents).sanctuary.settings.mode === 'program' && services.getProgramState(second.webContents).sanctuary.settings.mode === 'program', 'Mirror Program overrides all saved background routes');
      assert.equal(services.getSettings().displayBackgrounds.displays['101'].assetId, services.listBackgroundMedia().find(item => item.name === 'blue.png').id, 'Mirror Program preserves saved backgrounds');
      await until(() => first.webContents.executeJavaScript(`Boolean(document.querySelector('.projection-canvas'))`), 'independent screen returns to mirrored Program');
      await until(() => first.webContents.executeJavaScript(`(()=>{const c=document.querySelector('.projection-canvas'),v=document.querySelector('.projection-video'),s=document.createElement('canvas');s.width=s.height=1;const x=s.getContext('2d');if(v?.readyState>=2&&getComputedStyle(v).visibility==='visible')x.drawImage(v,0,0,1,1);else x.drawImage(c,0,0,1,1);const p=x.getImageData(0,0,1,1).data;return p[0]>230&&p[1]<15})()`), 'Mirror Program displays actual Program pixels despite saved blue background');
      await changeField('Sanctuary display mode', 'independent');
      await until(() => services.getProgramState(first.webContents).sanctuary.settings.mode === 'independent', 'independent mode restores saved display background');
      await js(`window.testStore.getState().updateSettings({sanctuaryDisplay:{...window.testStore.getState().settings.sanctuaryDisplay,textSource:'program'},lowerThird:{...window.testStore.getState().settings.lowerThird,entranceAnimation:'reveal',exitAnimation:'fade',animationDurationMs:1400,slides:[{id:'motion-1',text:'First animated slide'},{id:'motion-2',text:'Second animated slide'}],programSlideId:'motion-1',activeSlideId:'motion-1'}})`);
      await until(() => first.webContents.executeJavaScript(`document.querySelector('.sanctuary-text[aria-hidden="false"]')?.getAnimations().some(a=>a.playState==='running')`), 'independent screen animates Show live').catch(async error => { throw Error(error.message+' '+JSON.stringify({state:services.getProgramState(first.webContents).sanctuary,dom:await first.webContents.executeJavaScript(`document.body.innerHTML.slice(0,2500)`) })); });
      await wait(1500);
      await js(`window.testStore.getState().stageLowerThird(window.testStore.getState().settings.lowerThird.slides,'motion-2',true)`);
      await until(() => first.webContents.executeJavaScript(`document.querySelector('.sanctuary-text[aria-hidden="false"]')?.textContent.includes('Second animated slide')&&document.querySelector('.sanctuary-text[aria-hidden="false"]').getAnimations().some(a=>a.playState==='running')`), 'changing live slides animates on independent screen');
      await first.webContents.executeJavaScript(`window.cueAnimation=document.querySelector('.sanctuary-text[aria-hidden="false"]').getAnimations()[0]`);
      await js(`window.testStore.getState().stageLowerThird(window.testStore.getState().settings.lowerThird.slides.map(s=>s.id==='motion-2'?{...s,text:'Edited live without replay'}:s),'motion-2',true)`);
      await until(() => first.webContents.executeJavaScript(`document.querySelector('.sanctuary-text[aria-hidden="false"]')?.textContent.includes('Edited live')`), 'live text edit reaches independent screen');
      assert.equal(await first.webContents.executeJavaScript(`document.querySelector('.sanctuary-text[aria-hidden="false"]').getAnimations()[0]===window.cueAnimation`), true, 'editing the same live cue does not restart animation');
      await js(`window.testStore.getState().toggleFreeze()`); await wait(100);
      const pausedAt = await first.webContents.executeJavaScript(`window.cueAnimation.currentTime`); await wait(200);
      assert.equal(await first.webContents.executeJavaScript(`window.cueAnimation.currentTime`), pausedAt, 'Freeze pauses independent text animation');
      await js(`window.testStore.getState().cutToBlack()`); await wait(100);
      await js(`window.testStore.getState().clearCutToBlack()`); await wait(100);
      assert.ok(await first.webContents.executeJavaScript(`document.querySelector('.sanctuary-text[aria-hidden="false"]')?.textContent.includes('Edited live')`), 'Black/Restore retains the frozen independent text');
      assert.equal(await first.webContents.executeJavaScript(`window.cueAnimation.currentTime`), pausedAt);
      await js(`window.testStore.getState().toggleFreeze()`);
      await js(`window.testStore.getState().clearProgramText()`); await wait(1600);
      assert.equal(await first.webContents.executeJavaScript(`document.querySelectorAll('.sanctuary-text').length`), 0, 'independent exit removes old text');
      await changeField('Sanctuary display mode', 'program');
      studioContents.send('dualcast:app-command','open-backgrounds'); await wait(100);
      await chooseTarget('display:101'); await click('blue.png'); await apply();
      await chooseTarget('lowerThird'); await click('loop.webm'); await apply();
      await js(`window.testStore.getState().updateSettings({lowerThird:{...window.testStore.getState().settings.lowerThird,slides:[{id:'bg-test',text:'Welcome'}],activeSlideId:'bg-test',programSlideId:'bg-test',showOnProgram:true,entranceAnimation:'none',exitAnimation:'none',animationDurationMs:100}})`);
      await js(`window.testStore.getState().updateSettings({lowerThird:{...window.testStore.getState().settings.lowerThird,displayId:'202'}})`);
      await click('Apply & show on lower-third screen');
      await until(() => js(`window.testStore.getState().isLowerThirdProjecting`), 'lower-third screen opens from background editor'); await wait(1000);
      const count = bandFrameCount; const videoPixel = await programPixel(); await wait(2100);
      // Verify sustained delivery past the entrance, independently of the GPU's
      // offscreen WebP encoding rate. Pixel checks below also require motion.
      await until(() => bandFrameCount > count + 15, 'video lower third keeps sending frames after entrance animation', 6000);
      const bandPixels = () => js(`(()=>{const c=document.querySelector('.program-pane canvas'),s=document.createElement('canvas');s.width=40;s.height=8;s.getContext('2d').drawImage(c,0,c.height*.74,c.width,c.height*.25,0,0,40,8);return s.toDataURL();})()`);
      const animatedA = await bandPixels(); await wait(400); assert.notEqual(await bandPixels(), animatedA, 'video pixels animate, not just the delivery clock');
      await js(`window.testStore.getState().toggleFreeze()`); await wait(150);
      const frozen = await bandPixels(); await wait(400); assert.equal(await bandPixels(), frozen, 'Freeze holds the Program background');
      await js(`window.testStore.getState().cutToBlack()`); await wait(150); assert.ok((await programPixel()).slice(0, 3).every(value => value === 0), 'Black overrides the frozen background');
      await js(`window.testStore.getState().clearCutToBlack()`); await wait(150); assert.equal(await bandPixels(), frozen, 'Restore returns to the frozen frame');
      await js(`window.testStore.getState().toggleFreeze()`); await wait(200);
      assert.equal(await js(`document.querySelector('.background-draft-preview video').muted`), true);
      await chooseTarget('display:202');
      assert.equal(await js(`document.querySelector('.background-draft-preview video')?.muted`), true, 'physical lower-third screen edits its band background');
      await click('None ·'); await apply(); pixel = await programPixel();
      assert.equal(services.getSettings().displayBackgrounds.displays['202'], undefined, 'lower-third screen does not create an unused sanctuary override');
      assert.ok(Math.abs(pixel[0] - 16) < 8 && Math.abs(pixel[1] - 23) < 8 && Math.abs(pixel[2] - 34) < 8, `None clears old video: ${pixel}, old ${videoPixel}`);
      await chooseTarget('display:101'); await click('None ·'); await apply();
      assert.equal(services.getProgramState(first.webContents).sanctuary.background.kind, 'none');
      assert.equal(services.getProgramState(second.webContents).sanctuary.settings.mode, 'program');
      await click('Use shared sanctuary layout'); await wait(500); assert.equal(services.getProgramState(first.webContents).sanctuary.settings.mode, 'program');
      const red = services.listBackgroundMedia().find(item => item.name === 'red.png'), blue = services.listBackgroundMedia().find(item => item.name === 'blue.png'), video = services.listBackgroundMedia().find(item => item.name === 'loop.webm');
      await js(`localStorage.setItem('openchurch:profiles:v1',JSON.stringify([{id:'saved',name:'Sunday',createdAt:'2026-10-28',updatedAt:'2026-10-28',settings:window.testStore.getState().settings}]))`);
      dialog.showMessageBox = async () => ({ response: 0 });
      await js(`document.querySelector('[aria-label="Delete red.png"]').click()`); await wait(200);
      assert.equal(services.listBackgroundMedia().length, 3); assert.equal(services.getSettings().displayBackgrounds.program.assetId, red.id, 'canceled deletion preserves the active background');
      dialog.showMessageBox = async () => ({ response: 1 });
      await js(`document.querySelector('[aria-label="Delete red.png"]').click()`);
      await until(() => js(`document.querySelector('.backgrounds-panel [role="status"]')?.textContent.includes('Deleted red.png')`), 'delete an assigned image');
      assert.equal(services.getSettings().displayBackgrounds.program.kind, 'none');
      assert.equal(fs.existsSync(new URL(red.url)), false, 'managed image removed');
      assert.equal(fs.existsSync(path.join(temp, 'red-original-moved.png')), true, 'original image retained');
      assert.equal(await js(`JSON.parse(localStorage.getItem('openchurch:profiles:v1'))[0].settings.displayBackgrounds.program.kind`), 'none', 'saved profile clears the deleted background');
      await chooseTarget('lowerThird'); await click('loop.webm'); await apply();
      await js(`document.querySelector('[aria-label="Delete loop.webm"]').click()`);
      await until(() => js(`document.querySelector('.backgrounds-panel [role="status"]')?.textContent.includes('Deleted loop.webm')`), 'delete a video while it is playing on the lower-third output');
      assert.equal(services.getSettings().displayBackgrounds.lowerThird.kind, 'none');
      assert.equal(fs.existsSync(new URL(video.url)), false); assert.equal(fs.existsSync(path.join(temp, 'loop.webm')), true);
      fs.unlinkSync(new URL(blue.url));
      await js(`window.dispatchEvent(new Event('focus'))`);
      await until(() => js(`document.querySelector('.background-media-choice:disabled')?.textContent.includes('blue.png')`), 'missing file is marked unavailable');
      assert.equal(await js(`document.querySelector('[aria-label="Delete blue.png"]').matches(':disabled')`), false, 'missing uploads can still be deleted');
      await js(`document.querySelector('[aria-label="Delete blue.png"]').click()`);
      await until(() => services.listBackgroundMedia().length === 0, 'missing library entry deleted');
      await until(() => js(`document.querySelectorAll('.background-media-choice').length===1`), 'empty library shown after deletion');
      await click('Upload images'); await until(() => services.listBackgroundMedia().length === 1, 'remaining original can be uploaded again');
      assert.equal(services.listBackgroundMedia()[0].name, 'blue.png');
      assert.ok(await js(`document.querySelector('.backgrounds-panel').scrollWidth<=document.querySelector('.backgrounds-panel').clientWidth+2`), 'editor fits narrow dock');
      fs.writeFileSync(path.join(temp, 'backgrounds-ui.png'), (await studio.webContents.capturePage()).toPNG());
      await js(`document.querySelectorAll('.background-step')[1].scrollIntoView({block:'start'})`); await wait(150);
      fs.writeFileSync(path.join(temp, 'backgrounds-library-ui.png'), (await studio.webContents.capturePage()).toPNG());
      const stored = services.getSettings(); assert.equal(stored.displayBackgrounds.program.kind, 'none'); assert.equal(stored.displayBackgrounds.lowerThird.kind, 'none');
      // This is the exact destruction order from the reported popup: WebContents
      // emits destroyed while its BrowserWindow can still appear in getAllWindows.
      for (const window of outputs) window.close();
      studio.webContents.once('destroyed', () => { services.stopAudioPlugins(); services.stopVirtualCamera(); });
      studio.close(); await wait(300);
      await services.closeProjectionWindows(); await services.closeLowerThirdWindow();
      const reopened = new HiddenWindow({ width: 1400, height: 900, webPreferences: { preload: path.join(root, 'tmp/preload.js'), contextIsolation: true, backgroundThrottling: false } });
      services.registerBackgroundMediaIpc(reopened.webContents);
      services.registerAudioPluginIpc(reopened.webContents); services.registerVirtualCameraIpc(reopened.webContents);
      await reopened.loadFile(path.join(temp, 'renderer/index.html'));
      reopened.webContents.send('dualcast:app-command', 'open-backgrounds');
      await until(() => reopened.webContents.executeJavaScript(`document.querySelector('.background-library')?.textContent.includes('blue.png')`), 'uploaded library restored after reopening studio');
      assert.equal(await reopened.webContents.executeJavaScript(`document.querySelectorAll('.background-media-choice').length`), 2);
      assert.equal(await reopened.webContents.executeJavaScript(`Boolean(document.querySelector('[aria-label="Delete red.png"]')||document.querySelector('[aria-label="Delete loop.webm"]'))`), false, 'deleted uploads stay deleted after reopening');
      assert.equal(await reopened.webContents.executeJavaScript(`window.__backgroundTestStore.getState().settings.displayBackgrounds.program.assetId`), stored.displayBackgrounds.program.assetId);
      reopened.close();
      for (let i = 0; i < 5; i++) {
        const survivor = new HiddenWindow({ show: false }), primary = new HiddenWindow({ show: false });
        services.registerAudioPluginIpc(primary.webContents); services.registerVirtualCameraIpc(primary.webContents); services.registerBackgroundMediaIpc(primary.webContents);
        primary.close(); await wait(40); services.stopAudioPlugins(); survivor.close();
      }
      // Let renderer/video/GPU teardown finish before the normal Electron quit.
      // app.exit() forcefully exits while native completion ports can still run.
      await wait(750);
      console.log('PASS: visible and selectable connected screens on independent startup, mode changes and hotplug; numbered screen identifiers; disconnected outputs rejected; uploaded images/videos with search/filter; safe draft selection; Apply & show; independent/shared routing; untouched mirror; muted looping lower-third video; Freeze/Black; None; cancel/delete active image and playing video; original files preserved; missing files removable; saved profiles cleaned; deletion and reuse persist after reopening; narrow dock; safe repeated shutdown.');
      app.quit();
    } catch (error) {
      console.error(error);
      if (!studio.isDestroyed()) fs.writeFileSync(path.join(temp, 'backgrounds-failure.png'), (await studio.webContents.capturePage()).toPNG());
      app.exit(1);
    }
  });
}

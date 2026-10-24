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
      window.setBounds = bounds => { window.testDisplayId = bounds.x === 0 ? '101' : '202'; };
      return window;
    }
    Object.setPrototypeOf(HiddenWindow, BrowserWindow);
    global.__backgroundTestElectron = { ...electron, BrowserWindow: HiddenWindow, screen: { ...electron.screen, getAllDisplays: () => displays, getPrimaryDisplay: () => displays[0] } };
    const services = require('../tmp/background-services.cjs');
    const studio = new HiddenWindow({ width: 1400, height: 900, webPreferences: { preload: path.join(root, 'tmp/preload.js'), contextIsolation: true, backgroundThrottling: false } });
    services.registerIpcHandlers(); services.registerAudioPluginIpc(studio.webContents); services.registerBackgroundMediaIpc(studio.webContents); services.registerVirtualCameraIpc(studio.webContents);
    let bandFrameCount = 0;
    electron.ipcMain.on('dualcast:lower-third-frame', event => { if (event.sender === studio.webContents) bandFrameCount++; });
    services.updateSettings({ qualityPreset: 'low', outputResolution: '720p', frameRate: 30, audioMode: 'none', networkOutput: { enabled: false, port: 8787, operatorPin: '' } });
    const js = code => studio.webContents.executeJavaScript(code, true);
    async function until(predicate, label, milliseconds = 12000) { const end = Date.now() + milliseconds; while (!await predicate()) { if (Date.now() > end) throw Error('Timed out: ' + label); await wait(80); } }
    const click = text => js(`(()=>{const b=[...document.querySelectorAll('.backgrounds-panel button')].find(b=>b.textContent.includes(${JSON.stringify(text)}));if(!b||b.disabled)throw Error('Unavailable button: '+${JSON.stringify(text)});b.click();})()`);
    async function chooseTarget(target) {
      await js(`(()=>{const e=document.querySelector('[aria-label="Background destination"]');Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype,'value').set.call(e,${JSON.stringify(target)});e.dispatchEvent(new Event('change',{bubbles:true}));})()`); await wait(100);
    }
    async function apply() { await click('Apply background'); await until(() => js(`document.querySelector('.backgrounds-panel [role="status"]')?.textContent.includes('Background applied')`), 'background save'); await wait(400); }
    const programPixel = () => js(`(()=>{const c=document.querySelector('.program-pane canvas');return [...c.getContext('2d').getImageData(c.width*.03,c.height*.94,1,1).data];})()`);
    try {
      dialog.showOpenDialog = async (...args) => { const options = args.at(-1); return { canceled: false, filePaths: options.filters[0].name === 'Images' ? ['red.png', 'blue.png'].map(name => path.join(temp, name)) : [path.join(temp, 'loop.webm')] }; };
      await studio.loadFile(path.join(temp, 'renderer/index.html'));
      await js(`window.testStore=window.__backgroundTestStore;if(!window.testStore)throw Error('Test store unavailable');`);
      studio.webContents.send('dualcast:app-command', 'open-backgrounds');
      await until(() => js(`Boolean(document.querySelector('.backgrounds-panel'))`), 'central editor');
      await click('Upload images'); await until(() => js(`document.querySelector('.background-library').textContent.includes('blue.png')`), 'image upload');
      await click('Upload videos'); await until(() => js(`document.querySelector('.background-library').textContent.includes('loop.webm')`), 'video upload');
      assert.equal(services.listBackgroundMedia().length, 3);
      fs.renameSync(path.join(temp, 'red.png'), path.join(temp, 'red-original-moved.png'));
      await chooseTarget('program'); await click('red.png'); await apply();
      let pixel = await programPixel(); assert.ok(pixel[0] > 240 && pixel[1] < 12, `managed Program image: ${pixel}`);
      await chooseTarget('display:101'); await click('blue.png'); await apply();
      await js(`window.testStore.setState({isProjecting:true})`);
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
      await chooseTarget('lowerThird'); await click('loop.webm'); await apply();
      await js(`window.testStore.getState().updateSettings({lowerThird:{...window.testStore.getState().settings.lowerThird,slides:[{id:'bg-test',text:'Welcome'}],activeSlideId:'bg-test',programSlideId:'bg-test',showOnProgram:true,entranceAnimation:'none',exitAnimation:'none',animationDurationMs:100}})`);
      await services.openLowerThirdWindow('202'); await wait(1000);
      await js(`window.testStore.setState({isLowerThirdProjecting:true})`); await wait(600);
      const count = bandFrameCount; const videoPixel = await programPixel(); await wait(2100);
      assert.ok(bandFrameCount > count + 15, 'video lower third keeps sending frames after entrance animation');
      const bandPixels = () => js(`(()=>{const c=document.querySelector('.program-pane canvas'),s=document.createElement('canvas');s.width=40;s.height=8;s.getContext('2d').drawImage(c,0,c.height*.74,c.width,c.height*.25,0,0,40,8);return s.toDataURL();})()`);
      const animatedA = await bandPixels(); await wait(400); assert.notEqual(await bandPixels(), animatedA, 'video pixels animate, not just the delivery clock');
      await js(`window.testStore.getState().toggleFreeze()`); await wait(150);
      const frozen = await bandPixels(); await wait(400); assert.equal(await bandPixels(), frozen, 'Freeze holds the Program background');
      await js(`window.testStore.getState().cutToBlack()`); await wait(150); assert.ok((await programPixel()).slice(0, 3).every(value => value === 0), 'Black overrides the frozen background');
      await js(`window.testStore.getState().clearCutToBlack()`); await wait(150); assert.equal(await bandPixels(), frozen, 'Restore returns to the frozen frame');
      await js(`window.testStore.getState().toggleFreeze()`); await wait(200);
      assert.equal(await js(`document.querySelector('.background-draft-preview video').muted`), true);
      await click('None ·'); await apply(); pixel = await programPixel();
      assert.ok(Math.abs(pixel[0] - 16) < 8 && Math.abs(pixel[1] - 23) < 8 && Math.abs(pixel[2] - 34) < 8, `None clears old video: ${pixel}, old ${videoPixel}`);
      await chooseTarget('display:101'); await click('None ·'); await apply();
      assert.equal(services.getProgramState(first.webContents).sanctuary.background.kind, 'none');
      assert.equal(services.getProgramState(second.webContents).sanctuary.settings.mode, 'program');
      await click('Use shared sanctuary layout'); await wait(500); assert.equal(services.getProgramState(first.webContents).sanctuary.settings.mode, 'program');
      assert.ok(await js(`document.querySelector('.backgrounds-panel').scrollWidth<=document.querySelector('.backgrounds-panel').clientWidth+2`), 'editor fits narrow dock');
      fs.writeFileSync(path.join(temp, 'backgrounds-ui.png'), (await studio.webContents.capturePage()).toPNG());
      const stored = services.getSettings(); assert.ok(stored.displayBackgrounds.program.assetId); assert.equal(stored.displayBackgrounds.lowerThird.kind, 'none');
      // This is the exact destruction order from the reported popup: WebContents
      // emits destroyed while its BrowserWindow can still appear in getAllWindows.
      for (const window of outputs) window.close();
      studio.webContents.once('destroyed', () => { services.stopAudioPlugins(); services.stopVirtualCamera(); });
      studio.close(); await wait(300);
      for (let i = 0; i < 5; i++) {
        const survivor = new HiddenWindow({ show: false }), primary = new HiddenWindow({ show: false });
        services.registerAudioPluginIpc(primary.webContents); services.registerVirtualCameraIpc(primary.webContents); services.registerBackgroundMediaIpc(primary.webContents);
        primary.close(); await wait(40); services.stopAudioPlugins(); survivor.close();
      }
      await wait(200);
      console.log('PASS: managed uploads survive moved originals; central editor, independent monitor backgrounds, untouched mirror, muted looping video band beyond entrance, None clears media, shared-layout restore, persisted assignments, narrow dock and repeated renderer/window shutdown without uncaught exceptions.');
      app.exit(0);
    } catch (error) { console.error(error); app.exit(1); }
  });
}

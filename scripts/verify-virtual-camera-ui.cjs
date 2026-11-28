const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { spawn, spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
if (process.platform !== 'win32') { console.log('SKIP: Windows virtual camera UI.'); process.exit(0); }
if (!process.versions.electron) {
  (async () => {
    for (const arch of ['x64', 'x86']) {
      const check = spawnSync(path.join(root, 'assets/virtual-camera', arch, 'openchurch-camera-host.exe'), ['--status'], { windowsHide: true });
      assert.notEqual(check.status, 0, 'Run in a test account without an installed OpenChurch camera.');
    }
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    fs.mkdirSync(path.join(root, 'tmp'), { recursive: true });
    require('esbuild').buildSync({ entryPoints: [path.join(root, 'electron/services/virtualCameraService.ts')], bundle: true, platform: 'node', format: 'cjs', external: ['electron'], outfile: path.join(root, 'tmp/camera-service-verification.cjs') });
    fs.writeFileSync(path.join(root, 'tmp/camera-test-preload.cjs'), `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('cameraTest',{getVirtualCameraStatus:()=>ipcRenderer.invoke('dualcast:get-virtual-camera-status'),configureVirtualCamera:action=>ipcRenderer.invoke('dualcast:configure-virtual-camera',action),sendVirtualCameraFrame:frame=>ipcRenderer.invoke('dualcast:virtual-camera-frame',frame),onVirtualCameraStatus:callback=>{const listener=(_event,status)=>callback(status);ipcRenderer.on('dualcast:virtual-camera-status',listener);return()=>ipcRenderer.removeListener('dualcast:virtual-camera-status',listener);}});`);
    const vite = spawn(process.execPath, [path.join(root, 'node_modules/vite/bin/vite.js'), '--host', '127.0.0.1', '--port', '5175', '--strictPort'], { cwd: root, env, windowsHide: true, stdio: 'ignore' });
    let electron;
    try {
      for (let i = 0; i < 100; i++) { if (await fetch('http://127.0.0.1:5175').then(r => r.ok).catch(() => false)) break; await wait(100); if (i === 99) throw Error('Vite fixture did not start.'); }
      electron = spawn(require('electron'), [__filename], { cwd: root, env, windowsHide: true, stdio: 'inherit' });
      const code = await new Promise(resolve => electron.once('exit', resolve)); assert.equal(code, 0);
    } finally { vite.kill(); electron?.kill(); }
  })().catch(error => { console.error(error); process.exitCode = 1; });
} else {
  const { app, BrowserWindow } = require('electron');
  app.setAppPath(root);
  app.setPath('userData', path.join(root, 'tmp/virtual-camera-ui-profile'));
  app.whenReady().then(async () => {
    const service = require('../tmp/camera-service-verification.cjs');
    const studio = new BrowserWindow({ show: false, width: 1400, height: 900, webPreferences: { backgroundThrottling: false, contextIsolation: true, preload: path.join(root, 'tmp/camera-test-preload.cjs') } });
    service.registerVirtualCameraIpc(studio.webContents);
    const js = source => studio.webContents.executeJavaScript(source, true);
    async function click(label) {
      await js(`(()=>{const button=[...document.querySelectorAll('#camera-acceptance button')].find(b=>b.textContent===${JSON.stringify(label)});if(!button||button.disabled)throw Error('Camera button unavailable: '+${JSON.stringify(label)});button.click();})()`);
      for (let i = 0; i < 150; i++) { const busy = await js(`document.querySelector('#camera-acceptance').textContent.includes('Preparing Virtual Camera')`); if (!busy) return; await wait(100); }
      throw Error('Camera action timed out: ' + label);
    }
    async function sample(expected) {
      // A separate process opens the registered camera through the OS.
      const result = spawnSync(require('ffmpeg-static'), ['-nostdin', '-hide_banner', '-loglevel', 'error', '-f', 'dshow', '-i', 'video=OpenChurch Virtual Camera', '-frames:v', '1', '-an', '-vf', 'scale=1:1', '-pix_fmt', 'rgb24', '-f', 'rawvideo', 'pipe:1'], { windowsHide: true, timeout: 10000 });
      assert.equal(result.status, 0, result.stderr.toString());
      const pixel = [...result.stdout];
      assert.ok(pixel.length === 3 && pixel.every((value, i) => Math.abs(value - expected[i]) < 12), `External camera pixel ${pixel}, expected ${expected}`);
    }
    try {
      await studio.loadURL('http://127.0.0.1:5175');
      await js(`(async()=>{
        const {useAppStore:store}=await import('/store/useAppStore.ts');window.cameraStore=store;
        const colors=['red','blue'];const sources={};for(const color of colors){const c=document.createElement('canvas');c.width=320;c.height=180;c.getContext('2d').fillStyle=color;c.getContext('2d').fillRect(0,0,320,180);sources[color]={id:color,name:color,type:'image',enabled:true,audioEnabled:false,rect:{x:0,y:0,width:100,height:100},data:{url:c.toDataURL()}};}
        store.setState({settings:{...store.getState().settings,outputResolution:'720p',qualityPreset:'low',frameRate:30,lowerThird:{...store.getState().settings.lowerThird,slides:[],activeSlideId:null,programSlideId:null}},isFrozen:false,isCutToBlack:false,transitionType:'cut'});
        store.getState().setStudioState({scenes:colors.map(id=>({id,name:id,sourceIds:[id]})),sources,groups:[],previewSceneId:'blue',programSceneId:'red'});
        Object.assign(window.dualcast,window.cameraTest);
        const {default:React}=await import('/@fs/'+${JSON.stringify(root.replace(/\\/g, '/'))}+'/node_modules/.vite/deps/react.js');
        const {default:ReactDOM}=await import('/@fs/'+${JSON.stringify(root.replace(/\\/g, '/'))}+'/node_modules/.vite/deps/react-dom_client.js');
        const {useVirtualCamera}=await import('/hooks/useVirtualCamera.ts');const {default:Controls}=await import('/components/ProductionControlsPanel.tsx');
        const ref={current:document.querySelector('.program-pane canvas')};if(!ref.current)throw Error('Program canvas missing');
        const container=document.createElement('div');container.id='camera-acceptance';container.style.cssText='position:fixed;right:12px;top:50px;width:280px;background:#101820;padding:16px;z-index:9999';document.body.append(container);
        function Test(){const camera=useVirtualCamera(ref);return React.createElement(Controls,{virtualCamera:camera,streamer:{status:'idle',destinationStatuses:[],formattedElapsed:'00:00',stopStream:()=>{}},studioModeActive:true});}
        window.cameraTestRoot=ReactDOM.createRoot(container);window.cameraTestRoot.render(React.createElement(Test));
      })()`);
      await wait(700);
      await click('Install Virtual Camera'); await click('Start Virtual Camera'); await wait(500); await sample([255, 0, 0]);
      await js(`window.cameraStore.getState().selectPreviewScene('blue')`); await wait(200); await sample([255, 0, 0]);
      await js(`window.cameraStore.getState().takeToProgram()`); await wait(500); await sample([0, 0, 255]);
      await js(`window.cameraStore.getState().cutToBlack()`); await wait(300); await sample([0, 0, 0]);
      await js(`window.cameraStore.getState().clearCutToBlack()`); await wait(300); await sample([0, 0, 255]);
      const fits = await js(`document.querySelector('#camera-acceptance .production-controls-panel').scrollWidth<=280`); assert.ok(fits, 'camera controls fit a narrow dock');
      fs.writeFileSync(path.join(root, 'tmp/virtual-camera-ui.png'), (await studio.webContents.capturePage()).toPNG());
      await click('Stop Virtual Camera'); await wait(350); await sample([0, 0, 0]);
      await click('Start Virtual Camera'); await wait(400); await sample([0, 0, 255]);
      await click('Stop Virtual Camera'); await click('Remove Virtual Camera');
      const status = await service.getVirtualCameraStatus(); assert.equal(status.installed, false);
      console.log('PASS: real Controls install/start/stop/remove, renderer-to-main frame IPC and native acknowledgements, external camera captures Program, Preview stays private, TAKE, black/restore, restart and narrow dock.');
    } catch (error) {
      console.error(error);
      const text = await js(`document.querySelector('#camera-acceptance')?.textContent`).catch(() => ''); console.error(text);
      app.exitCode = 1;
    } finally {
      service.stopVirtualCamera();
      for (const arch of ['x64', 'x86']) spawnSync(path.join(root, 'assets/virtual-camera', arch, 'openchurch-camera-host.exe'), ['--uninstall'], { windowsHide: true, timeout: 10000 });
      app.exit(app.exitCode || 0);
    }
  });
}

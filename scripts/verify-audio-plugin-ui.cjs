// Exercise the real React panel, preload, registry, scanner and native host with
// a disposable profile. --installed also scans and enables local ReaStream.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const temp = path.join(root, 'tmp/plugin-ui');
if (!process.versions.electron) {
  (async () => {
    if (process.platform !== 'win32' || process.arch !== 'x64') throw Error('Requires Windows x64.');
    fs.mkdirSync(temp, { recursive: true });
    const build = require('esbuild').build;
    await build({ entryPoints: [path.join(root, 'electron/preload.ts')], bundle: true, platform: 'node', external: ['electron'], outfile: path.join(temp, 'preload.cjs') });
    await build({ entryPoints: [path.join(root, 'electron/services/audioPluginService.ts')], bundle: true, platform: 'node', external: ['electron', 'electron-store'], outfile: path.join(temp, 'service.cjs') });
    const source = `import React from 'react';import {createRoot} from 'react-dom/client';
      import Panel from '../../src/renderer/components/AudioPluginsPanel';
      import {createProgramAudioBus} from '../../src/renderer/utils/programAudioBus';
      import {attachAudioPluginBridge} from '../../src/renderer/utils/audioPluginBridge';
      const bus=createProgramAudioBus();const detach=attachAudioPluginBridge(bus);
      globalThis.testAudio={bus,detach,blocks:0};window.dualcast.onAudioPluginBlock(()=>globalThis.testAudio.blocks++);
      createRoot(document.getElementById('root')).render(<Panel/>);`;
    fs.writeFileSync(path.join(temp, 'entry.tsx'), source);
    await build({ entryPoints: [path.join(temp, 'entry.tsx')], bundle: true, outfile: path.join(temp, 'panel.js'), plugins: [{ name: 'worklet-url', setup(builder) {
      builder.onResolve({ filter: /\?url$/ }, args => ({ path: path.resolve(args.resolveDir, args.path.slice(0, -4)), namespace: 'worklet' }));
      builder.onLoad({ filter: /.*/, namespace: 'worklet' }, args => ({ contents: `export default ${JSON.stringify('data:text/javascript;base64,' + fs.readFileSync(args.path).toString('base64'))}`, loader: 'js' }));
    } }] });
    fs.writeFileSync(path.join(temp, 'index.html'), '<!doctype html><meta charset="utf-8"><title>VST scan verification</title><link rel="stylesheet" href="panel.css"><div id="root"></div><script src="panel.js"></script>');
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const child = require('node:child_process').spawn(require('electron'), [__filename, ...process.argv.slice(2)], { cwd: root, env, windowsHide: true, stdio: 'inherit' });
    const timeout = setTimeout(() => { child.kill(); process.exitCode = 1; }, 150_000);
    child.once('exit', code => { clearTimeout(timeout); process.exitCode = code ?? 1; });
  })().catch(error => { console.error(error); process.exitCode = 1; });
} else {
  const { app, BrowserWindow, dialog } = require('electron');
  const profile = path.join(temp, `profile-${process.pid}`);
  fs.mkdirSync(profile, { recursive: true }); app.setPath('userData', profile); app.setAppPath(root);
  app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
  const installed = process.argv.includes('--installed');
  const folder = installed ? path.join(process.env.ProgramFiles || 'C:\\Program Files', 'VSTPlugins/ReaPlugs') : path.join(temp, 'fixtures');
  if (!installed) {
    fs.mkdirSync(folder, { recursive: true });
    fs.copyFileSync(path.join(root, 'tmp/native-audio-host/test-plugin.dll'), path.join(folder, 'test-plugin.dll'));
    fs.writeFileSync(path.join(folder, 'bad.dll'), 'MZ');
  }
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [folder] });
  app.whenReady().then(async () => {
    const service = require(path.join(temp, 'service.cjs'));
    const window = new BrowserWindow({ show: false, webPreferences: { preload: path.join(temp, 'preload.cjs'), contextIsolation: true, backgroundThrottling: false } });
    service.registerAudioPluginIpc(window.webContents);
    const errors = [];
    window.webContents.on('console-message', event => { if (event.level === 'error') { errors.push(event.message); console.error(event.message); } });
    try {
      await window.loadFile(path.join(temp, 'index.html'));
      const result = await window.webContents.executeJavaScript(`(async()=>{
        const assert=(v,m)=>{if(!v)throw Error(m)},wait=ms=>new Promise(r=>setTimeout(r,ms));
        const button=label=>[...document.querySelectorAll('button')].find(b=>b.textContent===label);
        const until=async fn=>{for(let i=0;i<400;i++){if(await fn())return;await wait(100)}throw Error('Timed out: '+document.body.innerText)};
        await until(()=>button('Scan folder…')&&!button('Scan folder…').disabled);
        assert(button('Enable plugin').disabled,'Enable must wait for a selection');
        button('Scan folder…').click();await wait(50);
        await until(()=>!button('Scan folder…').disabled);
        let status=await window.dualcast.getAudioPluginStatus();
        assert(status.scan.added>0,'Scan found no usable effects: '+JSON.stringify(status));
        const select=document.querySelector('select');
        const target=status.plugins.find(p=>${installed ? "/ReaStream/.test(p.name)&&!p.name.includes(':4')" : "true"});
        assert(target,'Scan did not find requested plugin');
        select.value=target.id;select.dispatchEvent(new Event('change',{bubbles:true}));await wait(50);
        assert(!button('Enable plugin').disabled,'Scanned plugin was not selectable');
        await testAudio.bus.context.resume();button('Enable plugin').click();
        await until(()=>button('Bypass plugin')&&!button('Bypass plugin').disabled);
        await until(()=>testAudio.blocks>5);
        status=await window.dualcast.getAudioPluginStatus();assert(status.running&&status.activeId===target.id,'Enable failed');
        ${installed ? "assert(!button('Open plugin controls').disabled,'ReaStream controls unavailable');" : "assert(status.scan.issues.some(i=>i.includes('bad.dll')),'Bad DLL was not reported');"}
        const before=status.plugins.map(p=>p.id);
        button('Bypass plugin').click();await until(()=>button('Enable plugin')&&!button('Enable plugin').disabled);
        button('Scan folder…').click();await wait(50);await until(()=>!button('Scan folder…').disabled);
        status=await window.dualcast.getAudioPluginStatus();
        assert(status.scan.added===0&&status.scan.existing===before.length,'Rescan duplicated registrations');
        assert(status.plugins.every(p=>before.includes(p.id)),'Rescan lost saved IDs');
        testAudio.detach();testAudio.bus.stop();
        return {name:target.name,nativeBlocks:testAudio.blocks,scanned:status.scan.checked,existing:status.scan.existing,issues:status.scan.issues};
      })()`, true);
      assert.deepEqual(errors, []); assert.equal(service.getAudioPluginStatus().running, false);
      const saved = JSON.parse(fs.readFileSync(path.join(profile, 'audio-plugins.json'), 'utf8'));
      assert.ok(saved.folders.includes(folder), 'Custom scan folder saved');
      console.log(JSON.stringify({ ...result, customFolderSaved: true, rendererErrors: errors }));
      service.stopAudioPlugins(); window.destroy(); app.quit();
    } catch (error) { console.error(error); service.stopAudioPlugins(); window.destroy(); app.exit(1); }
  }).catch(error => { console.error(error); app.exit(1); });
}

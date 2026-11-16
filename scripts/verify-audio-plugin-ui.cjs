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
  const installedVst3 = process.argv.includes('--vst3-installed');
  const fixture = !installed && !installedVst3;
  const folder = installedVst3 ? path.join(process.env.CommonProgramFiles, 'VST3/Plugins.VST.NDI.Input.vst3') : installed ? path.join(process.env.ProgramFiles || 'C:\\Program Files', 'VSTPlugins/ReaPlugs') : path.join(temp, 'fixtures');
  if (fixture) {
    // Validate the production scanner/bridge against a noisy legacy effect,
    // not just a modern effect that keeps stdout clean.
    process.env.OPENCHURCH_TEST_PLUGIN_DIAGNOSTICS = '1';
    process.env.OPENCHURCH_TEST_PLUGIN_LEGACY = '1';
    fs.mkdirSync(folder, { recursive: true });
    fs.copyFileSync(path.join(root, 'tmp/native-audio-host/test-plugin.dll'), path.join(folder, 'test-plugin.dll'));
    const bundle = path.join(folder, 'fixture.vst3', 'Contents', 'x86_64-win');
    fs.mkdirSync(bundle, { recursive: true });
    fs.copyFileSync(path.join(root, 'tmp/native-audio-host/test-plugin-vst3.vst3'), path.join(bundle, 'fixture.vst3'));
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
        const select=document.querySelector('select[aria-label="Audio plugin"]');
        const target=status.plugins.find(p=>${installedVst3 ? "p.format==='vst3' && p.name==='NDI Input'" : installed ? "/ReaStream/.test(p.name)&&!p.name.includes(':4')" : "p.format==='vst2'"});
        assert(target,'Scan did not find requested plugin');
        select.value=target.id;select.dispatchEvent(new Event('change',{bubbles:true}));await wait(50);
        assert(!button('Enable plugin').disabled,'Scanned plugin was not selectable');
        await testAudio.bus.context.resume();button('Enable plugin').click();
        await until(()=>button('Bypass plugin')&&!button('Bypass plugin').disabled);
        await until(()=>testAudio.blocks>5);
        status=await window.dualcast.getAudioPluginStatus();assert(status.running&&status.activeId===target.id,'Enable failed');
        ${fixture ? "assert(status.scan.issues.some(i=>i.includes('bad.dll')),'Bad DLL was not reported');" : "assert(!button('Open plugin controls').disabled,'Plugin controls unavailable');"}
        const before=status.plugins.map(p=>p.id);
        button('Bypass plugin').click();await until(()=>button('Enable plugin')&&!button('Enable plugin').disabled);
        button('Scan folder…').click();await wait(50);await until(()=>!button('Scan folder…').disabled);
        status=await window.dualcast.getAudioPluginStatus();
        assert(status.scan.added===0&&status.scan.existing===before.length,'Rescan duplicated registrations');
        assert(status.plugins.every(p=>before.includes(p.id)),'Rescan lost saved IDs');
        if(${fixture}) {
          const vst3=status.plugins.find(p=>p.format==='vst3');
          assert(vst3?.name==='OpenChurch VST3 test','VST3 bundle was not registered');
          const next=await window.dualcast.configureAudioPlugin({action:'start',id:vst3.id});
          assert(next.running&&next.activeId===vst3.id,'VST3 failed to activate');
          const blocks=testAudio.blocks;
          await until(()=>testAudio.blocks>blocks+5);
          await window.dualcast.configureAudioPlugin({action:'stop'});
          select.value=target.id;select.dispatchEvent(new Event('change',{bubbles:true}));
        }
        testAudio.detach();testAudio.bus.stop();
        return {name:target.name,nativeBlocks:testAudio.blocks,scanned:status.scan.checked,existing:status.scan.existing,issues:status.scan.issues};
      })()`, true);
      if (fixture) {
        process.env.OPENCHURCH_TEST_PLUGIN_CRASH_RESTORE = '1';
        const failure = await window.webContents.executeJavaScript(`(async()=>{
          const status=await window.dualcast.getAudioPluginStatus();
          try {await window.dualcast.configureAudioPlugin({action:'start',id:status.plugins.find(item=>item.format==='vst2').id});throw Error('Expected preset restore failure');}
          catch(error){return {message:String(error),running:(await window.dualcast.getAudioPluginStatus()).running};}
        })()`);
        delete process.env.OPENCHURCH_TEST_PLUGIN_CRASH_RESTORE;
        assert.ok(failure.message.includes('saved settings'), failure.message);
        assert.equal(failure.running, false);
        result.presetCrashDiagnosed = true;
      }
      assert.deepEqual(errors, []); assert.equal(service.getAudioPluginStatus().running, false);
      const saved = JSON.parse(fs.readFileSync(path.join(profile, 'audio-plugins.json'), 'utf8'));
      assert.ok(saved.folders.includes(folder), 'Custom scan folder saved');
      console.log(JSON.stringify({ ...result, customFolderSaved: true, rendererErrors: errors }));
      service.stopAudioPlugins(); window.destroy(); app.quit();
    } catch (error) { console.error(error); service.stopAudioPlugins(); window.destroy(); app.exit(1); }
  }).catch(error => { console.error(error); app.exit(1); });
}

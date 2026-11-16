// Real Chromium UI -> HTTP -> Electron IPC -> production store verification.
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");
const root = path.resolve(__dirname, "..");
if (!process.versions.electron) {
  (async () => {
    fs.mkdirSync(path.join(root, "tmp"), { recursive: true });
    require("esbuild").buildSync({ stdin: { contents: `exports.network = require('./electron/services/networkOutputService'); exports.ipc = require('./electron/services/remoteControlIpc');`, resolveDir: root },
      bundle: true, platform: "node", format: "cjs", external: ["electron"], outfile: path.join(root, "tmp/mobile-verification.cjs") });
    const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
    const vite = spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", "5176", "--strictPort"], { cwd: root, env, windowsHide: true, stdio: "ignore" });
    let electron;
    try {
      for (let i = 0; i < 100; i++) {
        if (await fetch("http://127.0.0.1:5176").then(response => response.ok).catch(() => false)) break;
        if (i === 99) throw Error("Verification renderer did not start.");
        await new Promise(resolve => setTimeout(resolve, 100));
      }
      electron = spawn(require("electron"), [__filename], { cwd: root, env, windowsHide: true, stdio: "inherit" });
      process.exitCode = await new Promise(resolve => electron.once("exit", code => resolve(code ?? 1)));
    } finally { vite.kill(); electron?.kill(); }
  })().catch(error => { console.error(error); process.exitCode = 1; });
} else {
  const { app, BrowserWindow, ipcMain } = require("electron");
  const { network, ipc } = require("../tmp/mobile-verification.cjs");
  app.setPath("userData", path.join(root, "tmp/mobile-verification-profile"));
  app.commandLine.appendSwitch("use-fake-device-for-media-stream");
  app.commandLine.appendSwitch("use-fake-ui-for-media-stream");
  app.whenReady().then(async () => {
    let hub, studio, phone, heartbeat;
    const results = [];
    const assert = (condition, message) => { if (!condition) throw Error(message); results.push(message); };
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const js = code => phone.webContents.executeJavaScript(code);
    const until = async (code, message) => {
      for (let i = 0; i < 100; i++) { if (await js(code)) return; await wait(100); }
      throw Error("Timed out: " + message);
    };
    try {
      const preload = path.join(root, "tmp/mobile-verification-preload.cjs");
      fs.writeFileSync(preload, `const {contextBridge,ipcRenderer}=require('electron'); contextBridge.exposeInMainWorld('__mobileBridge', {
        publish:state=>ipcRenderer.send('dualcast:remote-control-state',state),
        frame:data=>ipcRenderer.send('dualcast:program-frame',data),
        reply:data=>ipcRenderer.send('dualcast:remote-command-reply',data),
        on:handler=>ipcRenderer.on('dualcast:remote-command',(_event,data)=>handler(data))});`);
      studio = new BrowserWindow({ width: 1400, height: 950, show: false, webPreferences: { preload, contextIsolation: true, backgroundThrottling: false } });
      ipc.registerRemoteControlIpc(studio.webContents);
      ipcMain.on("dualcast:program-frame", (_event, frame) => network.updateNetworkProgramFrame(frame));
      await studio.loadURL("http://127.0.0.1:5176");
      await studio.webContents.executeJavaScript(`(async()=>{
        const {useAppStore:store}=await import('/store/useAppStore.ts');
        const remote=await import('/utils/remoteControl.ts');
        const {defaultScrollingText}=await import(${JSON.stringify('/@fs/' + root.replace(/\\/g, '/') + '/src/shared/scrollingText.ts')});
        const picture=(id,color)=>({id,name:id,type:'image',enabled:true,audioEnabled:false,rect:{x:0,y:0,width:100,height:100},data:{url:'data:image/svg+xml,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="'+color+'"/><text x="480" y="245" font-family="sans-serif" font-size="40" text-anchor="middle" fill="white">OPENCHURCH</text><text x="480" y="300" font-family="sans-serif" font-size="21" text-anchor="middle" fill="white">Sunday Worship Service</text></svg>')}});
        store.getState().setStudioState({scenes:[{id:'wide',name:'Sanctuary wide',sourceIds:['stage','ticker']},{id:'close',name:'Pulpit camera',sourceIds:['pulpit']},{id:'worship',name:'Worship team',sourceIds:['stage']}],sources:{
          stage:picture('stage','#153d3a'),pulpit:picture('pulpit','#293556'),
          ticker:{id:'ticker',name:'Service notices',type:'scrolling-text',enabled:true,audioEnabled:false,rect:{x:0,y:90,width:100,height:10},data:{...defaultScrollingText,text:'Welcome to our Sunday service'}}},groups:[],previewSceneId:'close',programSceneId:'wide'});
        store.getState().setSettings({...store.getState().settings,operatorStationName:'Sunday service',swapPreviewProgram:false});
        window.dualcast.fetchScripture=async({reference})=>({reference,text:'<p>The Lord is my shepherd; I shall not want.</p>'});
        window.__mobileFixturePublish=()=>{
          window.__mobileBridge.publish(remote.getRemoteControlState('idle'));
          const canvas=document.querySelector('.program-canvas')||document.querySelectorAll('canvas')[1];
          if(canvas&&canvas.width) window.__mobileBridge.frame(canvas.toDataURL('image/webp',0.6));
        };
        window.__mobileBridge.on(async({id,command,expiresAt})=>{
          try{const message=await remote.executeRemoteCommand(command,{startRecording:async()=>{},stopRecording:()=>{}},expiresAt);window.__mobileFixturePublish();window.__mobileBridge.reply({id,ok:true,message});}
          catch(error){window.__mobileBridge.reply({id,ok:false,message:error.message});}
        });
        window.__mobileFixturePublish();
      })()`);
      heartbeat = setInterval(() => { if (!studio.isDestroyed()) void studio.webContents.executeJavaScript("window.__mobileFixturePublish()"); }, 500);
      hub = network.createNetworkOutputServer({ operatorPin: "58319427", assetDirectory: path.join(root, "assets/mobile") });
      await new Promise(resolve => hub.listen(0, "127.0.0.1", resolve));
      phone = new BrowserWindow({ width: 390, height: 844, show: false, useContentSize: true, webPreferences: { backgroundThrottling: false } });
      await phone.loadURL(`http://127.0.0.1:${hub.address().port}/operator`);
      await js(`document.getElementById('pin').value='58319427';document.getElementById('login-form').requestSubmit()`);
      await until(`document.getElementById('connection').textContent==='Connected'`, "phone sign-in");
      assert(await js(`document.getElementById('desk').hidden===false`), "PIN unlock reaches the live mobile desk");
      assert(await js(`document.documentElement.scrollWidth<=innerWidth`), "390px phone layout has no horizontal overflow");
      await until(`document.getElementById('program-image').naturalWidth>0`, "Program confidence picture");
      assert(await js(`!document.getElementById('program-image').hidden`), "Authenticated Program picture appears on the phone");
      await wait(500);
      // A hidden window's first capture can contain its previous compositor frame.
      await phone.webContents.capturePage(); await wait(100);
      fs.writeFileSync(path.join(root, "tmp/mobile-phone.png"), (await phone.webContents.capturePage()).toPNG());
      await js(`document.querySelector('[data-tab=text]').click();document.getElementById('text-body').value='Welcome to church';document.getElementById('text-form').requestSubmit()`);
      await until(`document.getElementById('toast').textContent.includes('staged.')`, "stage announcement");
      const staged = await studio.webContents.executeJavaScript(`import('/store/useAppStore.ts').then(({useAppStore:s})=>({active:s.getState().settings.lowerThird.activeSlideId,live:s.getState().settings.lowerThird.programSlideId}))`);
      assert(staged.active && !staged.live, "Phone stages text without changing live presentation text");
      await until(`!document.getElementById('show-text').disabled`, "show text enabled"); await js(`document.getElementById('show-text').click()`);
      await until(`document.getElementById('toast').textContent==='Staged text is live.'`, "show text");
      assert(await studio.webContents.executeJavaScript(`import('/store/useAppStore.ts').then(({useAppStore:s})=>s.getState().settings.lowerThird.programSlideId===s.getState().settings.lowerThird.activeSlideId)`), "Phone commits staged text to the real Program store");
      await js(`document.querySelector('[data-tab=scripture]').click();document.getElementById('reference').value='Psalm 23:1';document.getElementById('scripture-form').requestSubmit()`);
      await until(`document.getElementById('toast').textContent.includes('Psalm 23:1 staged')`, "scripture lookup");
      await until(`document.getElementById('live-slide').textContent.includes('Psalm 23:1')`, "scripture cue state refresh");
      assert(await js(`document.getElementById('live-slide').textContent.includes('Psalm 23:1')`), "Scripture loaded through the desktop adapter appears in presentation cues");
      await js(`document.querySelector('[data-tab=ticker]').click();document.getElementById('ticker-text').value='Prayer meeting Wednesday';document.getElementById('ticker-speed').value='75';document.getElementById('ticker-form').requestSubmit()`);
      await until(`document.getElementById('toast').textContent==='Program ticker updated.'`, "ticker apply");
      assert(await studio.webContents.executeJavaScript(`import('/store/useAppStore.ts').then(({useAppStore:s})=>s.getState().programSources['program:ticker'].data.text==='Prayer meeting Wednesday')`), "Phone changes only the committed Program ticker");
      await js(`document.querySelector('[data-tab=live]').click()`);
      await until(`!document.getElementById('take').disabled`, "scene controls enabled");
      await js(`[...document.querySelectorAll('.scene')].find(tile=>tile.textContent.includes('Pulpit camera')).querySelectorAll('button')[1].click()`);
      await until(`document.getElementById('program-name').textContent==='Pulpit camera'`, "camera switch");
      assert(await studio.webContents.executeJavaScript(`import('/store/useAppStore.ts').then(({useAppStore:s})=>s.getState().programSceneId==='close')`), "Camera scene changes reach Program through HTTP and Electron IPC");
      for (const [width, height] of [[320, 740], [768, 1024], [1024, 768]]) {
        phone.setContentSize(width, height); await wait(150);
        assert(await js(`document.documentElement.scrollWidth<=innerWidth`), `${width}×${height} layout has no horizontal overflow`);
      }
      phone.setContentSize(320, 740);
      for (const tab of ["text", "scripture", "ticker", "more"]) {
        await js(`document.querySelector('[data-tab=${tab}]').click()`); await wait(50);
        assert(await js(`document.documentElement.scrollWidth<=innerWidth`), `${tab} controls fit a 320px phone`);
      }
      await js(`document.querySelector('[data-tab=live]').click()`); phone.setContentSize(1024, 768); await wait(150);
      fs.writeFileSync(path.join(root, "tmp/mobile-tablet.png"), (await phone.webContents.capturePage()).toPNG());
      clearInterval(heartbeat); network.updateRemoteControlState(null);
      await until(`!document.getElementById('offline').hidden`, "disconnected banner");
      assert(await js(`[...document.querySelectorAll('[data-control]')].every(button=>button.disabled)`), "Disconnected studio disables every production control");
      await js(`document.getElementById('lock').click()`);
      await until(`document.getElementById('desk').hidden`, "lock sign-out");
      assert(await js(`!document.getElementById('login').hidden`), "Lock revokes the session and returns to sign-in");
      console.log(JSON.stringify({ ok: true, checks: results, screenshots: ["tmp/mobile-phone.png", "tmp/mobile-tablet.png"] }, null, 2));
      app.exit(0);
    } catch (error) { console.error(error); app.exit(1); }
    finally { clearInterval(heartbeat); hub?.closeAllConnections(); hub?.close(); phone?.destroy(); studio?.destroy(); }
  });
}

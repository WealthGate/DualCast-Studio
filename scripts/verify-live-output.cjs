// Exercise real canvas pixels in Electron, including rapidly moved faders and
// cold media. Run with: node scripts/verify-live-output.cjs
const path = require("path");
const fs = require("fs");
const { spawn, spawnSync } = require("child_process");
const root = path.resolve(__dirname, "..");

if (!process.versions.electron) {
  (async () => {
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    fs.mkdirSync(path.join(root, "tmp"), { recursive: true });
    const motion = spawnSync(require("ffmpeg-static"), ["-hide_banner", "-loglevel", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=60", "-t", "4", "-an", "-c:v", "libvpx", "-deadline", "realtime", "-cpu-used", "8", "-b:v", "2M", "-threads", "2", path.join(root, "tmp/freeze-regression.webm")], { windowsHide: true });
    if (motion.status !== 0) throw Error("Could not generate moving-video fixture: " + motion.stderr);
    require("esbuild").buildSync({ entryPoints: [path.join(root, "electron/services/cursorFreeCaptureService.ts")], bundle: true, platform: "node", format: "cjs", external: ["electron", "ffmpeg-static"], outfile: path.join(root, "tmp/capture-verification.cjs") });
    require("esbuild").buildSync({ entryPoints: [path.join(root, "electron/services/projectionService.ts")], bundle: true, platform: "node", format: "cjs", external: ["electron"], outfile: path.join(root, "tmp/projection-verification.cjs") });
    require("esbuild").buildSync({ entryPoints: [path.join(root, "electron/services/browserSourceService.ts")], bundle: true, platform: "node", format: "cjs", external: ["electron", "electron-log"], outfile: path.join(root, "tmp/browser-verification.cjs") });
    if(process.argv.includes("--settings-only")) require("esbuild").buildSync({entryPoints:[path.join(root,"electron/services/hardwareService.ts")],bundle:true,platform:"node",format:"cjs",external:["electron","electron-log","ffmpeg-static"],outfile:path.join(root,"tmp/hardware-verification.cjs")});
    const vite = spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", "5174", "--strictPort"], { cwd: root, env, windowsHide: true, stdio: "ignore" });
    let electron;
    try {
      for (let i = 0; i < 100; i++) {
        if (await fetch("http://127.0.0.1:5174").then(r => r.ok).catch(() => false)) break;
        await new Promise(resolve => setTimeout(resolve, 100));
        if (i === 99) throw new Error("Test renderer did not start.");
      }
      electron = spawn(require("electron"), [__filename, ...process.argv.slice(2)], { cwd: root, env, windowsHide: true, stdio: "inherit" });
      const code = await new Promise(resolve => electron.once("exit", resolve));
      process.exitCode = code ?? 1;
    } finally { vite.kill(); electron?.kill(); }
  })().catch(error => { console.error(error); process.exitCode = 1; });
} else {
  const { app, BrowserWindow, desktopCapturer, nativeImage } = require("electron");
  const profile = path.join(require('os').tmpdir(), `openchurch-live-output-${process.pid}`);
  app.setAppPath(root);
  fs.mkdirSync(profile, { recursive: true });
  fs.writeFileSync(path.join(root,"tmp/output-test-preload.js"),`const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('__outputTest',{send:frame=>ipcRenderer.send('dualcast:program-video-frame',frame)});`);
  app.setPath("userData", profile);
  app.commandLine.appendSwitch("use-fake-device-for-media-stream");
  app.commandLine.appendSwitch("use-fake-ui-for-media-stream");
  app.whenReady().then(async () => {
    const window = new BrowserWindow({ show: false, width: 1400, height: 900, webPreferences: { backgroundThrottling: false, contextIsolation: true, preload:path.join(root,"tmp/output-test-preload.js") } });
    window.webContents.on("console-message", event => { if (event.level === "error") console.error(event.message); });
    try {
      await window.loadURL("http://127.0.0.1:5174");
      window.showInactive();
      let result = {};
      if(process.argv.includes("--video-only")){console.log(JSON.stringify(await window.webContents.executeJavaScript(`(${require('./verify-video-sharing.cjs').toString()})(${JSON.stringify('/@fs/'+root.replace(/\\/g,'/')+'/tmp/freeze-regression.webm')})`)));app.exit(0);return;}
      if(process.argv.includes("--settings-only")){const hardware=await require('./../tmp/hardware-verification.cjs').getHardwareCapabilities();console.log(JSON.stringify(await require('./verify-hardware-settings.cjs')(window,hardware)));app.exit(0);return;}
      if(process.argv.includes("--recording-only")){console.log(JSON.stringify(await require('./verify-recording-track.cjs')(window,root)));app.exit(0);return;}
      if(process.argv.includes("--native-video-only")){console.log(JSON.stringify(await require('./verify-native-h264.cjs')(root)));app.exit(0);return;}
      if (process.argv.includes("--hardware-only")) {
        console.log(JSON.stringify(await window.webContents.executeJavaScript(`(async()=>({mimes:Object.fromEntries(['video/mp4;codecs=avc1.42E02A,mp4a.40.2','video/webm;codecs=h264,opus','video/mp4;codecs=hvc1.1.6.L186.B0,mp4a.40.2','video/webm;codecs=av1,opus'].map(m=>[m,MediaRecorder.isTypeSupported(m)])),encoder:await VideoEncoder.isConfigSupported({codec:'avc1.42002a',width:1920,height:1080,framerate:60,bitrate:8000000,hardwareAcceleration:'prefer-hardware',avc:{format:'annexb'}})}))()`)));
        app.exit(0); return;
      }
      if (!process.argv.includes("--performance-only") && !process.argv.includes("--recovery-only")) {
      result = await window.webContents.executeJavaScript(`(async () => {
        const { useAppStore: store } = await import('/store/useAppStore.ts');
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        await wait(300);
        const color = fill => { const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 180; const ctx = canvas.getContext('2d'); ctx.fillStyle = fill; ctx.fillRect(0, 0, 320, 180); return canvas.toDataURL(); };
        const image = (id, url) => ({id, name:id, type:'image', enabled:true, audioEnabled:false, rect:{x:0,y:0,width:100,height:100}, data:{url}});
        const encodedFrames = [];
        let monitorEncodedFrames = false;
        window.dualcast.sendProgramFrame = frame => { if (monitorEncodedFrames) encodedFrames.push(frame); };
        const red = image('red', color('#ff0000')), blue = image('blue', color('#0000ff')), green = image('green', color('#00ff00'));
        const scenes = [red, blue, green].map(source => ({id:source.id, name:source.id, sourceIds:[source.id]}));
        store.setState({ settings:{...store.getState().settings, networkOutput:{...store.getState().settings.networkOutput,enabled:true}, qualityPreset:'low', frameRate:30, lowerThird:{...store.getState().settings.lowerThird, slides:[], activeSlideId:null, programSlideId:null}, swapPreviewProgram:true}, isFrozen:false, isCutToBlack:false, transitionType:'cut', manualBlend:0 });
        store.getState().setStudioState({scenes, sources:{red,blue,green}, groups:[], previewSceneId:'blue', programSceneId:'red'});
        const pixel = () => { const canvas = document.querySelector('.program-pane canvas'); return [...canvas.getContext('2d').getImageData(canvas.width/2, canvas.height/2, 1, 1).data]; };
        const assert = (value, message) => { if (!value) throw Error(message + ' pixel=' + pixel()); };
        const until = async predicate => { for(let i=0;i<100;i++){ if(predicate())return; await wait(20); } throw Error('Timed out waiting for output; pixel=' + pixel()); };
        await until(() => pixel()[0] > 245);
        await wait(200);
        monitorEncodedFrames = true;
        store.getState().setManualBlend(0.5);
        await wait(300);
        const midpoint = pixel();
        assert(midpoint[0] > 115 && midpoint[2] > 115 && midpoint[0]+midpoint[2] > 245, 'Blend loses brightness; blend='+store.getState().manualBlend+' state='+JSON.stringify({p:store.getState().previewSceneId,status:document.querySelector('[role=status]')?.textContent}));
        let blackFrames = 0;
        const sample = () => { const p = pixel(); if(p[0]+p[1]+p[2]<20) blackFrames++; };
        for(let i=0;i<60;i++){ store.getState().setManualBlend((i%10)/10); await wait(5); sample(); }
        store.getState().setManualBlend(1); store.getState().completeManualBlend();
        await until(() => pixel()[2] > 245);
        store.getState().setTransitionType('fade'); store.getState().setTransitionDuration(300); store.getState().takeToProgram();
        for(let i=0;i<30;i++){ await wait(15); sample(); }
        assert(pixel()[0]>245, 'Fade did not finish on red');
        const NativeImage = window.Image;
        window.Image = class extends NativeImage { set src(value) { if(value===green.data.url) setTimeout(()=>{super.src=value;}, 350); else super.src=value; } };
        store.getState().selectPreviewScene('green'); store.getState().setTransitionType('cut'); store.getState().takeToProgram();
        await wait(80); assert(pixel()[0]>245, 'Cold capture cleared the live picture');
        for(let i=0;i<30;i++){ await wait(15); sample(); }
        assert(pixel()[1]>245, 'Cold capture did not become live');
        window.Image = NativeImage;
        monitorEncodedFrames = false;
        let encodedBlackFrames = 0;
        for (const url of encodedFrames) {
          const img = new NativeImage(); await new Promise(resolve => { img.onload=resolve; img.src=url; });
          const canvas = document.createElement('canvas'); canvas.width=canvas.height=1;
          const ctx=canvas.getContext('2d'); ctx.drawImage(img, img.width/2, img.height/2, 1, 1, 0, 0, 1, 1);
          const p=ctx.getImageData(0,0,1,1).data;
          if(p[0]+p[1]+p[2]<20) encodedBlackFrames++;
        }
        assert(encodedFrames.length>3 && encodedBlackFrames===0, 'Encoded output contained blank frames: '+encodedBlackFrames);
        store.getState().toggleFreeze(); await wait(50); store.getState().cutToBlack();
        await until(()=>pixel()[0]+pixel()[1]+pixel()[2]<20);
        store.getState().clearCutToBlack(); await until(()=>pixel()[1]>245);
        assert(blackFrames===0, 'Unexpected black transition frames: '+blackFrames);
        store.getState().toggleFreeze();
        const meetingCanvas=document.createElement('canvas'); meetingCanvas.width=320; meetingCanvas.height=180;
        const meetingContext=meetingCanvas.getContext('2d'); meetingContext.fillStyle='blue'; meetingContext.fillRect(0,0,320,180);
        meetingContext.fillStyle='red'; meetingContext.fillRect(0,0,256,144);
        const meeting={...image('meeting',meetingCanvas.toDataURL()),crop:{top:0,left:0,right:20,bottom:20}};
        const meetingScene={id:'meeting',name:'Meeting crop',sourceIds:['meeting']};
        store.getState().setStudioState({scenes:[meetingScene],sources:{meeting},groups:[],previewSceneId:'meeting',programSceneId:'meeting'});
        await until(()=>pixel()[0]>245);
        const meetingOutput=document.querySelector('.program-pane canvas'), meetingPixels=meetingOutput.getContext('2d');
        for(const x of [.1,.9]) for(const y of [.1,.9]) assert(meetingPixels.getImageData(meetingOutput.width*x,meetingOutput.height*y,1,1).data[2]<10,'Crop leaked meeting controls');
        let cameraRequests = 0;
        const originalMedia = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
        navigator.mediaDevices.getUserMedia = constraints => { cameraRequests++; return originalMedia(constraints); };
        const camera = {id:'cam',name:'Test camera',type:'camera',enabled:true,audioEnabled:false,rect:{x:0,y:0,width:100,height:100},data:{deviceId:''}};
        const cameraScene = {id:'camera',name:'Camera',sourceIds:['cam']};
        store.getState().setStudioState({scenes:[cameraScene],sources:{cam:camera},groups:[],previewSceneId:'camera',programSceneId:'camera'});
        await wait(700);
        store.getState().takeToProgram(); store.getState().updateSourceRect('cam',{x:5,y:5,width:90,height:90});
        await wait(200);
        assert(cameraRequests===1, 'Camera was reopened for Program or geometry edits: '+cameraRequests);
        return {midpoint, blackFrames, encodedBlackFrames, encodedFrames:encodedFrames.length, cameraRequests, checks:['rapid fader', 'manual completion', 'fade', 'cold cut hold', 'freeze/black/restore', 'shared camera capture','meeting area crop']};
      })()`);
      // Drive the actual range control with native Chromium pointer events.
      // Store-only tests cannot detect endpoint repeat events or capture loss.
      await window.webContents.executeJavaScript(`(async () => {
        const { useAppStore: store } = await import('/store/useAppStore.ts');
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        const pixel = () => { const canvas=document.querySelector('.program-pane canvas'); return [...canvas.getContext('2d').getImageData(canvas.width/2,canvas.height/2,1,1).data]; };
        const seed = async () => {
          const source = (id,fill) => { const c=document.createElement('canvas');c.width=320;c.height=180;const x=c.getContext('2d');x.fillStyle=fill;x.fillRect(0,0,320,180);return {id,name:id,type:'image',enabled:true,audioEnabled:false,rect:{x:0,y:0,width:100,height:100},data:{url:c.toDataURL()}}; };
          const red=source('red','red'),blue=source('blue','blue');
          store.setState({transitionType:'cut',manualBlend:0,isFrozen:false,isCutToBlack:false});
          store.getState().setStudioState({scenes:[{id:'red',name:'Red',sourceIds:['red']},{id:'blue',name:'Blue',sourceIds:['blue']}],sources:{red,blue},groups:[],programSceneId:'red',previewSceneId:'blue'});
          for(let i=0;i<100 && pixel()[0]<245;i++) await wait(20);
          await wait(100);
        };
        window.__transitionCheck={store,wait,pixel,seed};
        await seed();
        store.getState().setTransitionType('iris');
      })()`);
      window.focus(); window.webContents.focus();
      const bounds = await window.webContents.executeJavaScript(`(() => {
        const input=document.querySelector('input[aria-label="Live Preview blend"]');
        input.scrollIntoView({block:'center'});const r=input.getBoundingClientRect();
        return {left:r.left,width:r.width,y:r.top+r.height/2};
      })()`);
      const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
      const mouse = (type, amount) => window.webContents.sendInputEvent({ type, x: Math.round(bounds.left + 8 + (bounds.width - 16) * amount), y: Math.round(bounds.y), button: "left", clickCount: 1, ...(type === "mouseMove" ? { modifiers: ["leftButtonDown"] } : {}) });
      const readFader = () => window.webContents.executeJavaScript(`(() => { const {store,pixel}=window.__transitionCheck; const state=store.getState();return {blend:state.manualBlend,revision:state.programRevision,program:state.programSceneId,pixel:pixel()}; })()`);
      mouse("mouseDown", 0); await sleep(30);
      const faderPixels = [];
      for (const value of [0.2, 0.4, 0.6, 0.8]) {
        mouse("mouseMove", value); await sleep(75);
        const sample=await readFader();
        if(Math.abs(sample.blend-value)>0.12 || sample.pixel[0]+sample.pixel[2]<245) throw Error(`Native fader failed: ${JSON.stringify(sample)}`);
        faderPixels.push(sample.pixel[2]);
      }
      if(faderPixels.some((value,index)=>index && value<faderPixels[index-1]-3)) throw Error("Fader flickered backwards during a continuous drag.");
      const beforeComplete=await readFader();
      mouse("mouseMove", 1); await sleep(100);
      for(let i=0;i<5;i++) { mouse("mouseMove", 1); await sleep(35); }
      mouse("mouseUp", 1); await sleep(100);
      const afterComplete=await readFader();
      if(afterComplete.revision!==beforeComplete.revision+1 || afterComplete.program!=="blue" || afterComplete.pixel[2]<245) throw Error(`Endpoint swapped scenes more than once: ${JSON.stringify(afterComplete)}`);
      mouse("mouseDown", 0); mouse("mouseMove", 0.6); await sleep(75); mouse("mouseUp", 0.6); await sleep(200);
      for(let i=0;i<20 && (await readFader()).blend!==0;i++) await sleep(25);
      if((await readFader()).blend!==0) throw Error("Fader did not return to Program after release.");
      result.fader={forwardSamples:faderPixels, endpointTakes:afterComplete.revision-beforeComplete.revision, resetOnRelease:true, independentOfSelectedEffect:true};
      result.transitionButtons=await window.webContents.executeJavaScript(`(async () => {
        const {sceneTransitions}=await import('/utils/transitions.ts');
        const {store,wait,pixel,seed}=window.__transitionCheck;
        const checked=[];
        for(const effect of sceneTransitions){
          await seed();store.getState().setTransitionDuration(200);
          const button=document.querySelector('button[aria-label="Apply '+effect.label+' transition"]');
          if(!button)throw Error('Missing transition button '+effect.label);
          button.click();
          for(let i=0;i<18;i++){await wait(18);const p=pixel();if(p[0]+p[2]<240)throw Error(effect.label+' exposed a dark frame: '+p);}
          if(pixel()[2]<245 || store.getState().transitionType!==effect.type)throw Error(effect.label+' did not complete on Preview');
          checked.push(effect.label);
        }
        return checked;
      })()`);
      result.scrollingText = await window.webContents.executeJavaScript(`(${require("./verify-scrolling-text.cjs").toString()})(${JSON.stringify("/@fs/" + root.replace(/\\/g, "/") + "/src/shared/scrollingText.ts")})`);
      console.log("Transitions, fader and scrolling-text controls passed.");
      result.frameRecovery = await window.webContents.executeJavaScript(`(${require("./verify-frame-recovery.cjs").toString()})()`);
      result.nativeRenderer = await window.webContents.executeJavaScript(`(${require("./verify-native-renderer.cjs").toString()})()`);
      result.videoSharing = await window.webContents.executeJavaScript(`(${require('./verify-video-sharing.cjs').toString()})(${JSON.stringify('/@fs/'+root.replace(/\\/g,'/')+'/tmp/freeze-regression.webm')})`);
      fs.writeFileSync(path.join(root, "tmp/scrolling-text-verification.png"), (await window.webContents.capturePage()).toPNG());
      }
      // Pixel-readback checks can make Chromium migrate a canvas to software.
      // Benchmark a fresh page, matching normal GPU-backed production rendering.
      await window.loadURL("http://127.0.0.1:5174");
      await window.webContents.executeJavaScript(`(async () => {
        const {useAppStore:store}=await import('/store/useAppStore.ts');
        const {defaultScrollingText}=await import(${JSON.stringify("/@fs/" + root.replace(/\\/g, "/") + "/src/shared/scrollingText.ts")});
        const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));await wait(300);
        const ticker={id:'ticker',name:'Ticker',type:'scrolling-text',enabled:true,audioEnabled:false,rect:{x:0,y:70,width:100,height:15},data:{...defaultScrollingText,text:'Smooth video and scrolling announcements at the selected output frame rate'}};
        const video={id:'motion',name:'Moving video',type:'video',enabled:true,audioEnabled:false,rect:{x:0,y:0,width:100,height:100},data:{url:${JSON.stringify("/@fs/" + root.replace(/\\/g, "/") + "/tmp/freeze-regression.webm")},loop:true}};
        const scene={id:'performance',name:'Output performance',sourceIds:['motion','ticker']};
        store.setState({isFrozen:false,isCutToBlack:false,transitionType:'cut',manualBlend:0,settings:{...store.getState().settings,networkOutput:{...store.getState().settings.networkOutput,enabled:false}}});
        store.getState().setStudioState({scenes:[scene],sources:{ticker,motion:video},groups:[],previewSceneId:scene.id,programSceneId:scene.id});
        window.__transitionCheck={store,wait};await wait(100);
      })()`);
      if (process.argv.includes("--recovery-only")) {
        result.frameRecovery = await window.webContents.executeJavaScript(`(${require("./verify-frame-recovery.cjs").toString()})()`);
        result.nativeRenderer = await window.webContents.executeJavaScript(`(${require("./verify-native-renderer.cjs").toString()})()`);
        console.log(JSON.stringify(result)); app.exit(0); return;
      }
      const performanceFps = process.argv.includes("--fps=60") ? 60 : 30;
      result.performance = await window.webContents.executeJavaScript(`(${require("./verify-output-performance.cjs").toString()})(${performanceFps})`);
      console.log(JSON.stringify({performance:result.performance}));
      if (!process.argv.includes("--performance-only")) result.projectionVideo = await require("./verify-projection-video.cjs")(window, root);
      if (!process.argv.includes("--performance-only")) result.browserCapture = await require("./verify-browser-capture.cjs")(root);
      if (!process.argv.includes("--performance-only")) result.nativeVideo = await require("./verify-native-h264.cjs")(root);
      if (!process.argv.includes("--performance-only")) result.recording = await require("./verify-recording-track.cjs")(window,root);
      if (process.platform === "win32") {
        const capture = require(path.join(root, "tmp/capture-verification.cjs"));
        const { EventEmitter } = require("events");
        const target = new BrowserWindow({ show: false, width: 640, height: 400, webPreferences: { backgroundThrottling: false } });
        await target.loadURL("data:text/html,<title>Meeting capture test</title><body style='margin:0;background:red;height:100vh'></body>");
        target.showInactive();
        const sources = await desktopCapturer.getSources({ types: ["window"], thumbnailSize: { width: 0, height: 0 } });
        const source = sources.find(item => item.name === "Meeting capture test");
        if (!source) throw Error("Native test meeting window was not listed.");
        const frames = [];
        const owner = Object.assign(new EventEmitter(), { id: 9999, isDestroyed: () => false, send: (_channel, frame) => { if (frame.dataUrl) { frames.push(frame.dataUrl); capture.acknowledgeCursorFreeFrame(9999, frame.id, frame.sequence); } } });
        const id = await capture.startCursorFreeCapture(owner, source.id);
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        for (let i=0;i<100&&!frames.length;i++) await wait(50);
        if (!frames.length) throw Error("Native meeting capture produced no frames.");
        target.setTitle("Meeting title changed");
        await target.webContents.executeJavaScript("let tick=0; setInterval(()=>{document.body.style.background='rgb('+(200+(tick++%50))+',0,0)';},33)");
        const popup = new BrowserWindow({ show: false, ...target.getBounds(), alwaysOnTop: true });
        await popup.loadURL("data:text/html,<title>Meeting capture test</title><body style='margin:0;background:blue;height:100vh'>Chat / notification overlay</body>");
        popup.showInactive();
        target.setSize(1000, 650);
        const count = frames.length;
        await wait(700);
        if (frames.length <= count) throw Error("Native capture stopped after window title changed.");
        const image = nativeImage.createFromDataURL(frames.at(-1));
        const size = image.getSize(), pixels = image.toBitmap(), offset = (Math.floor(size.height/2)*size.width+Math.floor(size.width/2))*4;
        if (pixels[offset+2]<180 || pixels[offset]>60) throw Error("Native meeting window returned blank or wrong pixels.");
        capture.stopCursorFreeCapture(id, owner.id);
        capture.stopAllCursorFreeCaptures();
        popup.destroy();
        target.destroy();
        result.nativeWindow = { frames: frames.length, size, renamedWindow: true, resizedWindow: true, separatePopupExcluded: true };
      }
      console.log(JSON.stringify(result));
      app.exit(0);
    } catch (error) { console.error(error); app.exit(1); }
  });
}

// Actual renderer AudioWorklet -> production preload IPC -> isolated VST host
// -> preload -> AudioWorklet, with measured PCM and fixed-latency dry fallback.
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const temp = path.join(root, "tmp");
const port = 5175;

if (!process.versions.electron) {
  (async () => {
    if (process.platform !== "win32" || process.arch !== "x64") throw Error("This native bridge test requires Windows x64.");
    fs.mkdirSync(temp, { recursive: true });
    const esbuild = require("esbuild");
    esbuild.buildSync({ entryPoints: [path.join(root, "electron/preload.ts")], bundle: true, platform: "node", format: "cjs", external: ["electron"], outfile: path.join(temp, "audio-plugin-test-preload.cjs") });
    esbuild.buildSync({ entryPoints: [path.join(root, "electron/services/audioPluginService.ts")], bundle: true, platform: "node", format: "cjs", external: ["electron", "electron-store"], outfile: path.join(temp, "audio-plugin-test-service.cjs") });
    fs.writeFileSync(path.join(temp, "audio-plugin-test.html"), '<!doctype html><meta charset="utf-8"><title>Native audio bridge verification</title>');
    fs.writeFileSync(path.join(temp, "audio-plugin-test-probe.js"), `
      class AudioBridgeProbe extends AudioWorkletProcessor {
        constructor(){super();this.capture=null;this.port.onmessage=({data})=>{if(data.type==='capture')this.capture={id:data.id,at:0,reference:new Float32Array(16384),left:new Float32Array(16384),right:new Float32Array(16384)};};}
        process(inputs){const item=this.capture;if(item){const length=inputs[1]?.[0]?.length??128;for(let i=0;i<length&&item.at<item.left.length;i++,item.at++){item.reference[item.at]=inputs[0]?.[0]?.[i]??0;item.left[item.at]=inputs[1]?.[0]?.[i]??0;item.right[item.at]=inputs[1]?.[1]?.[i]??0;}if(item.at===item.left.length){this.capture=null;this.port.postMessage(item,[item.reference.buffer,item.left.buffer,item.right.buffer]);}}return true;}
      }
      registerProcessor('audio-bridge-probe',AudioBridgeProbe);
    `);
    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    const vite = spawn(process.execPath, [path.join(root, "node_modules/vite/bin/vite.js"), "--host", "127.0.0.1", "--port", String(port), "--strictPort"], { cwd: root, env, windowsHide: true, stdio: "ignore" });
    let electron;
    try {
      for (let attempt = 0; attempt < 100; attempt++) {
        if (await fetch(`http://127.0.0.1:${port}`).then(response => response.ok).catch(() => false)) break;
        if (vite.exitCode !== null) throw Error("The isolated Vite server exited before startup.");
        await new Promise(resolve => setTimeout(resolve, 100));
        if (attempt === 99) throw Error("The isolated Vite server did not start.");
      }
      electron = spawn(require("electron"), [__filename], { cwd: root, env, windowsHide: true, stdio: "inherit" });
      const code = await new Promise(resolve => electron.once("exit", resolve));
      process.exitCode = code ?? 1;
    } finally { vite.kill(); electron?.kill(); }
  })().catch(error => { console.error(error); process.exitCode = 1; });
} else {
  const { app, BrowserWindow } = require("electron");
  const profile = path.join(require("node:os").tmpdir(), `openchurch-plugin-bridge-${process.pid}`);
  const pluginFile = path.join(root, "tmp/native-audio-host/test-plugin.dll");
  if (!fs.existsSync(pluginFile)) throw Error("Build the deterministic fixture with node scripts/build-audio-host.cjs --test-fixture first.");
  fs.mkdirSync(path.join(profile, "audio-plugin-state"), { recursive: true });
  app.setAppPath(root);
  app.setPath("userData", profile);
  app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
  const preset = (id, value) => {
    const data = Buffer.alloc(20);
    [0x3156434f, 0x4f435446, 1, 4].forEach((number, index) => data.writeUInt32LE(number, index * 4));
    data.writeFloatLE(value, 16);
    fs.writeFileSync(path.join(profile, "audio-plugin-state", `${id}.bin`), data);
  };
  const info = { name: "OpenChurch host test", vendor: "OpenChurch", format: "vst2", hasEditor: false, inputs: 2, outputs: 2, latencyFrames: 0, filePath: pluginFile };
  fs.writeFileSync(path.join(profile, "audio-plugins.json"), JSON.stringify({ plugins: [{ ...info, id: "fixture-attenuator" }, { ...info, id: "fixture-generator" }] }));
  preset("fixture-attenuator", 0.5); preset("fixture-generator", -1);
  // Retain only the child launched by this isolated test's service. Never find
  // or terminate a host belonging to the user's running studio.
  const childProcess = require("node:child_process");
  const originalSpawn = childProcess.spawn;
  let latestHost;
  childProcess.spawn = (...args) => {
    const child = originalSpawn(...args);
    if (path.basename(String(args[0])) === "openchurch-audio-host.exe") latestHost = child;
    return child;
  };
  app.whenReady().then(async () => {
    const service = require(path.join(temp, "audio-plugin-test-service.cjs"));
    const window = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false, contextIsolation: true, preload: path.join(temp, "audio-plugin-test-preload.cjs") } });
    service.registerAudioPluginIpc(window.webContents);
    const errors = [];
    window.webContents.on("console-message", event => { if (event.level === "error") errors.push(event.message); });
    try {
      await window.loadURL(`http://127.0.0.1:${port}/@fs/${path.join(temp, "audio-plugin-test.html").replace(/\\/g, "/")}`);
      const initial = await window.webContents.executeJavaScript(`(async()=>{
        const {createProgramAudioBus}=await import('/utils/programAudioBus.ts');
        const {attachAudioPluginBridge}=await import('/utils/audioPluginBridge.ts');
        const bus=createProgramAudioBus(),context=bus.context,track=bus.destination.stream.getAudioTracks()[0];
        const assert=(value,message)=>{if(!value)throw Error(message);},wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
        const stats={incoming:0,statuses:[]};
        const offBlocks=window.dualcast.onAudioPluginBlock(()=>stats.incoming++);
        const offStatus=window.dualcast.onAudioPluginStatus(status=>stats.statuses.push({running:status.running,message:status.message}));
        const detach=attachAudioPluginBridge(bus);
        const tone=context.createBufferSource(),buffer=context.createBuffer(2,48000*4,48000);
        let seed=9;
        for(let i=0;i<buffer.length;i++){seed=(Math.imul(seed,1664525)+1013904223)|0;const value=(seed/2147483648)*0.2;buffer.getChannelData(0)[i]=value;buffer.getChannelData(1)[i]=-value;}
        tone.buffer=buffer;tone.loop=true;tone.connect(bus.pluginInput);tone.start();
        await context.audioWorklet.addModule('/@fs/'+${JSON.stringify(path.join(temp, "audio-plugin-test-probe.js").replace(/\\/g, "/"))});
        const probe=new AudioWorkletNode(context,'audio-bridge-probe',{numberOfInputs:2,numberOfOutputs:1,outputChannelCount:[1]});
        bus.pluginInput.connect(probe,0,0);bus.output.connect(probe,0,1);
        const quiet=context.createGain();quiet.gain.value=0;probe.connect(quiet);quiet.connect(context.destination);
        let captureId=0;const captures=new Map();
        probe.port.onmessage=({data})=>{captures.get(data.id)?.(data);captures.delete(data.id);};
        const capture=()=>new Promise((resolve,reject)=>{const id=++captureId;const timeout=setTimeout(()=>{captures.delete(id);reject(Error('Audio capture stalled'));},3000);captures.set(id,data=>{clearTimeout(timeout);resolve(data);});probe.port.postMessage({type:'capture',id});});
        const compare=(data,delay,gain)=>{
          let matched=0,dry=0,other=0,stereoError=0,samples=0;
          for(let i=4096;i<data.left.length;i++){
            const expected=data.reference[i-delay];
            if(Math.abs(data.left[i]-expected*gain)<1e-6)matched++;else if(Math.abs(data.left[i]-expected)<1e-6)dry++;else other++;
            stereoError=Math.max(stereoError,Math.abs(data.right[i]+data.left[i]));samples++;
          }
          return {matched:matched/samples,dry:dry/samples,other:other/samples,stereoError,samples,delayFrames:delay};
        };
        await context.resume();await wait(150);
        const direct=compare(await capture(),2048,1);assert(direct.matched===1,'Dry bridge changed PCM: '+JSON.stringify(direct));
        const started=await window.dualcast.configureAudioPlugin({action:'start',id:'fixture-attenuator'});
        assert(started.running&&started.session,'Native plugin did not activate: '+JSON.stringify(started));
        await wait(500);const wet=compare(await capture(),2048,0.5);
        assert(stats.incoming>10,'The native PCM roundtrip returned no blocks: '+JSON.stringify(stats));
        assert(wet.matched>0.85&&wet.other<0.01&&wet.stereoError<1e-6,'Native effect did not process correct stereo PCM at the fixed deadline: '+JSON.stringify({wet,stats}));
        await window.dualcast.configureAudioPlugin({action:'stop'});await wait(200);
        const bypass=compare(await capture(),2048,1);assert(bypass.matched===1,'Bypass lost dry PCM or changed latency: '+JSON.stringify(bypass));
        await window.dualcast.configureAudioPlugin({action:'start',id:'fixture-attenuator'});await wait(300);
        globalThis.bridgeTest={bus,context,track,tone,probe,quiet,detach,offBlocks,offStatus,stats,assert,wait,capture,compare};
        return {direct,wet,bypass,incomingBlocks:stats.incoming};
      })()`, true);
      if (!latestHost || latestHost.killed) throw Error("Could not locate this test's native child for crash isolation verification.");
      latestHost.kill();
      const recovered = await window.webContents.executeJavaScript(`(async()=>{
        const t=globalThis.bridgeTest;const {bus,context,track,tone,stats,assert,wait,capture,compare}=t;
        for(let i=0;i<20;i++){if(!(await window.dualcast.getAudioPluginStatus()).running)break;await wait(50);}
        const failed=await window.dualcast.getAudioPluginStatus();assert(!failed.running,'Killed host was still active');
        await wait(150);const afterCrash=compare(await capture(),2048,1);assert(afterCrash.matched===1,'Plugin crash interrupted or retimed source audio: '+JSON.stringify(afterCrash));
        tone.disconnect();
        await window.dualcast.configureAudioPlugin({action:'start',id:'fixture-generator'});await wait(400);
        const generated=await capture();let generatedCount=0;
        for(let i=4096;i<generated.left.length;i++)if(Math.abs(generated.left[i]-0.125)<1e-6&&Math.abs(generated.right[i]-0.125)<1e-6)generatedCount++;
        const generatorFraction=generatedCount/(generated.left.length-4096);assert(generatorFraction>0.85,'Receiver/generator did not receive the silent Program clock: '+generatorFraction);
        bus.setMasterGain(0);await wait(200);const muted=await capture();const mutedPeak=muted.left.reduce((peak,value)=>Math.max(peak,Math.abs(value)),0);assert(mutedPeak<1e-6,'Mute all failed for generated audio: '+mutedPeak);
        bus.setMasterGain(0.5);await wait(200);const reduced=await capture();let reducedCount=0;
        for(let i=4096;i<reduced.left.length;i++)if(Math.abs(reduced.left[i]-0.0625)<1e-6)reducedCount++;
        const masterFraction=reducedCount/(reduced.left.length-4096);assert(masterFraction>0.85,'Master failed for generated audio: '+masterFraction);
        assert(bus.destination.stream.getAudioTracks()[0]===track&&track.readyState==='live','Native operations replaced Program output track');
        await window.dualcast.configureAudioPlugin({action:'stop'});await wait(100);t.detach();t.offBlocks();t.offStatus();tone.stop();bus.stop();
        return {afterCrash,generatorFraction,mutedPeak,masterFraction,stableAudioTrack:true,statuses:stats.statuses};
      })()`, true);
      console.log(JSON.stringify({ ...initial, ...recovered, rendererErrors: errors }));
      if (errors.length) throw Error("Renderer emitted errors: " + errors.join("; "));
      service.stopAudioPlugins();
      app.exit(0);
    } catch (error) {
      console.error(error);
      service.stopAudioPlugins();
      app.exit(1);
    }
  }).catch(error => { console.error(error); latestHost?.kill(); app.exit(1); });
}

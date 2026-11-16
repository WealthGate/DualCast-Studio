// Verify the exact Vite-emitted worklet URL under the packaged file:// origin.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
if (!process.versions.electron) {
  fs.mkdirSync(path.join(root, "tmp"), { recursive: true });
  require("esbuild").buildSync({ entryPoints: [path.join(root, "electron/services/audioWorkletProtocol.ts")], bundle: true, platform: "node", external: ["electron"], outfile: path.join(root, "tmp/production-worklet-protocol.cjs") });
  const html = fs.readFileSync(path.join(root, "dist/renderer/index.html"), "utf8");
  fs.writeFileSync(path.join(root, "tmp/production-worklet.html"), html.replace(/<script\b[^>]*><\/script>/g, ""));
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = require("node:child_process").spawn(require("electron"), [__filename], { cwd: root, env, windowsHide: true, stdio: "inherit" });
  child.once("exit", code => { process.exitCode = code ?? 1; });
} else {
  const { app, BrowserWindow } = require("electron");
  const { declareAudioWorkletProtocol, registerAudioWorkletProtocol } = require(path.join(root, "tmp/production-worklet-protocol.cjs"));
  declareAudioWorkletProtocol();
  app.setPath("userData", path.join(require("node:os").tmpdir(), `openchurch-production-worklet-${process.pid}`));
  app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
  app.whenReady().then(async () => {
    registerAudioWorkletProtocol(path.join(root, "dist/renderer"));
    const window = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
    try {
      await window.loadFile(path.join(root, "tmp/production-worklet.html"));
      const result = await window.webContents.executeJavaScript(`(async()=>{
        const context=new AudioContext({sampleRate:48000});
        try { await context.audioWorklet.addModule('openchurch-audio://worklet/audio-plugin-worklet.js'); }
        catch(error) { throw Error(error.name + ': ' + error.message); }
        const node=new AudioWorkletNode(context,'openchurch-native-plugin',{outputChannelCount:[2],channelCount:2,channelCountMode:'explicit'});
        const tone=context.createOscillator(),analyser=context.createAnalyser(),quiet=context.createGain();
        quiet.gain.value=0;tone.connect(node);node.connect(analyser);analyser.connect(quiet);quiet.connect(context.destination);tone.start();await context.resume();
        await new Promise(resolve=>setTimeout(resolve,350));
        const samples=new Float32Array(analyser.fftSize);analyser.getFloatTimeDomainData(samples);
        const peak=samples.reduce((max,sample)=>Math.max(max,Math.abs(sample)),0);
        if(peak<0.9)throw Error('Production file-origin worklet did not pass source audio: '+peak);
        tone.stop();node.port.postMessage({type:'stop'});node.port.close();await context.close();
        return {productionWorklet:true,fileOrigin:true,sourcePeak:peak};
      })()`);
      console.log(JSON.stringify(result)); app.exit(0);
    } catch (error) { console.error(String(error), error?.stack); app.exit(1); }
  }).catch(error => { console.error(error); app.exit(1); });
}

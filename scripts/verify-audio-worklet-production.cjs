// Verify the exact Vite-emitted worklet URL under the packaged file:// origin.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
if (!process.versions.electron) {
  const files = fs.readdirSync(path.join(root, "dist/renderer/assets")).filter(name => name.endsWith(".js"));
  const bundle = files.map(name => fs.readFileSync(path.join(root, "dist/renderer/assets", name), "utf8")).join("\n");
  const url = bundle.match(/data:text\/javascript[^"'`\s]+/)?.[0];
  if (!url) throw Error("The production build does not contain the audio processor URL.");
  fs.mkdirSync(path.join(root, "tmp"), { recursive: true });
  fs.writeFileSync(path.join(root, "tmp/production-worklet-url.json"), JSON.stringify(url));
  fs.writeFileSync(path.join(root, "tmp/production-worklet.html"), "<!doctype html><title>Production audio worklet verification</title>");
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const child = require("node:child_process").spawn(require("electron"), [__filename], { cwd: root, env, windowsHide: true, stdio: "inherit" });
  child.once("exit", code => { process.exitCode = code ?? 1; });
} else {
  const { app, BrowserWindow } = require("electron");
  app.setPath("userData", path.join(require("node:os").tmpdir(), `openchurch-production-worklet-${process.pid}`));
  app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
  app.whenReady().then(async () => {
    const window = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
    try {
      await window.loadFile(path.join(root, "tmp/production-worklet.html"));
      const url = JSON.parse(fs.readFileSync(path.join(root, "tmp/production-worklet-url.json"), "utf8"));
      const result = await window.webContents.executeJavaScript(`(async()=>{
        const context=new AudioContext({sampleRate:48000});
        await context.audioWorklet.addModule(${JSON.stringify(url)});
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
    } catch (error) { console.error(error); app.exit(1); }
  }).catch(error => { console.error(error); app.exit(1); });
}

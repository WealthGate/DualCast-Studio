// Real Chromium audio rendering: transparent bypass, EQ band response, stereo
// separation, stable routes, rapid controls, and network-generator mute/master.
const path = require("path");
const fs = require("fs");
const root = path.resolve(__dirname, "..");

if (!process.versions.electron) {
  const { spawn } = require("child_process");
  fs.mkdirSync(path.join(root, "tmp"), { recursive: true });
  require("esbuild").buildSync({
    stdin: { contents: 'export { createProgramEqualizer } from "./src/renderer/utils/programEqualizer"; export { createProgramAudioBus } from "./src/renderer/utils/programAudioBus"; export { createAudioInputEffect } from "./src/renderer/utils/audioInputEffects";', resolveDir: root },
    bundle: true, platform: "browser", format: "iife", globalName: "AudioFidelity",
    outfile: path.join(root, "tmp/audio-fidelity-module.js")
  });
  fs.writeFileSync(path.join(root, "tmp/audio-fidelity.html"), '<!doctype html><meta charset="utf-8"><title>Audio fidelity verification</title><script src="audio-fidelity-module.js"></script>');
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const child = spawn(require("electron"), [__filename], { cwd: root, env, stdio: "inherit", windowsHide: true });
  child.once("exit", code => { process.exitCode = code ?? 1; });
} else {
  const { app, BrowserWindow } = require("electron");
  app.setPath("userData", path.join(require("os").tmpdir(), `openchurch-audio-fidelity-${process.pid}`));
  app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
  app.whenReady().then(async () => {
    const window = new BrowserWindow({ show: false, webPreferences: { backgroundThrottling: false } });
    try {
      await window.loadFile(path.join(root, "tmp/audio-fidelity.html"));
      const result = await window.webContents.executeJavaScript(`(async () => {
        const {createProgramEqualizer,createProgramAudioBus,createAudioInputEffect}=AudioFidelity;
        const assert=(value,message)=>{if(!value)throw Error(message);};
        const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
        const defaults={enabled:false,lowGainDb:0,midGainDb:0,highGainDb:0};
        const frequencies=[80,1000,12000],rate=48000;
        const render=async patch=>{
          const context=new OfflineAudioContext(2,rate,rate),source=context.createBufferSource(),buffer=context.createBuffer(2,rate,rate);
          for(let channel=0;channel<2;channel++){
            const data=buffer.getChannelData(channel);
            for(let i=0;i<rate;i++)data[i]=frequencies.reduce((sum,f)=>sum+0.08*Math.sin(2*Math.PI*f*i/rate+channel*0.3),0);
          }
          source.buffer=buffer;
          const eq=createProgramEqualizer(context);source.connect(eq.input);eq.output.connect(context.destination);eq.update({...defaults,...patch});source.start();
          return {input:buffer,output:await context.startRendering()};
        };
        const amplitude=(buffer,frequency,channel=0)=>{
          const data=buffer.getChannelData(channel);let real=0,imag=0;
          for(let i=rate/2;i<rate;i++){const angle=2*Math.PI*frequency*i/rate;real+=data[i]*Math.cos(angle);imag+=data[i]*Math.sin(angle);}
          return Math.hypot(real,imag)*4/rate;
        };
        const bypass=await render({lowGainDb:12,midGainDb:-12,highGainDb:12});
        let bypassError=0;
        for(let channel=0;channel<2;channel++)for(let i=0;i<rate;i++)bypassError=Math.max(bypassError,Math.abs(bypass.output.getChannelData(channel)[i]-bypass.input.getChannelData(channel)[i]));
        assert(bypassError<1e-6,'EQ bypass changed source samples: '+bypassError);
        const flat=await render({enabled:true});
        let flatError=0;
        for(let channel=0;channel<2;channel++)for(let i=rate/2;i<rate;i++)flatError=Math.max(flatError,Math.abs(flat.output.getChannelData(channel)[i]-flat.input.getChannelData(channel)[i]));
        assert(flatError<1e-6,'Flat EQ changed source samples: '+flatError);
        const gains={};
        for(const [key,f,gain] of [['lowGainDb',80,6],['midGainDb',1000,-6],['highGainDb',12000,6]]){
          const rendered=await render({enabled:true,[key]:gain});
          const response=20*Math.log10(amplitude(rendered.output,f)/amplitude(rendered.input,f));
          assert(Math.abs(response-gain)<0.6,key+' response '+response+' dB');gains[key]=Number(response.toFixed(2));
        }
        const renderPreset = async preset => {
          const context = new OfflineAudioContext(2,rate,rate);
          const source = context.createBufferSource();
          source.buffer = context.createBuffer(1,rate,rate);
          const data = source.buffer.getChannelData(0);
          for(let i=0;i<rate;i++) {
            data[i] = [35,165,280,2650,3300].reduce((sum,f) => sum + 0.015*Math.sin(2*Math.PI*f*i/rate), 0);
          }
          const effect = createAudioInputEffect(context,preset);
          source.connect(effect.input);effect.output.connect(context.destination);source.start();
          const rendered = await context.startRendering();
          effect.stop();
          return rendered;
        };
        const clean = await renderPreset('clean');
        const radio = await renderPreset('radio');
        const vocal = await renderPreset('vocal');
        const choir = await renderPreset('choir');
        const change = (buffer,f) => 20*Math.log10(amplitude(buffer,f)/amplitude(clean,f));
        const width = buffer => {
          const left = buffer.getChannelData(0), right = buffer.getChannelData(1);
          let power = 0;
          for(let i=rate/2;i<rate;i++) power += (left[i]-right[i])**2;
          return Math.sqrt(power/(rate/2));
        };
        assert(change(radio,35)<-8 && change(radio,2650)>1, 'Radio Gold response in dB: '+[35,165,2650].map(f=>change(radio,f)));
        assert(change(vocal,280)<-1 && change(vocal,3300)>0.5, 'Lead Vocal response in dB: '+[280,3300].map(f=>change(vocal,f)));
        assert(width(clean)<1e-6 && width(vocal)<1e-6 && width(choir)>0.003, 'Choir did not add stereo vocal layers');
        const bus=createProgramAudioBus(),track=bus.destination.stream.getAudioTracks()[0];
        const context=bus.context,inputContext=new AudioContext({sampleRate:rate}),osc=inputContext.createOscillator(),toneGain=inputContext.createGain(),source=inputContext.createMediaStreamDestination();
        toneGain.gain.value=0.2;osc.connect(toneGain);toneGain.connect(source);osc.start();
        let routes=0;const original=context.createMediaStreamSource.bind(context);
        context.createMediaStreamSource=stream=>{routes++;return original(stream);};
        const analyser=context.createAnalyser();analyser.fftSize=2048;bus.output.connect(analyser);
        const data=new Float32Array(analyser.fftSize),peak=()=>{analyser.getFloatTimeDomainData(data);return data.reduce((n,v)=>Math.max(n,Math.abs(v)),0);};
        bus.setSources([{id:'music',stream:source.stream,gain:1}]);await inputContext.resume();await context.resume();await wait(500);
        const originalPeak=peak();assert(originalPeak>0.18&&originalPeak<0.22,'Source fidelity gain '+originalPeak+' '+JSON.stringify({routes,state:context.state,time:context.currentTime,inputState:inputContext.state,track:source.stream.getAudioTracks()[0].getSettings()}));
        for(let i=0;i<25;i++){
          bus.setSources([{id:'music',stream:source.stream,gain:0.5}]);
          bus.equalizer.update({...defaults,enabled:true});bus.equalizer.update(defaults);
          await wait(8);
        }
        await wait(100);const editedPeak=peak();
        assert(routes===1,'Gain/scene updates rebuilt '+routes+' source routes');
        assert(editedPeak>0.09&&editedPeak<0.11,'Rapid controls lost or suppressed audio: '+editedPeak);
        const interfaceOutput = inputContext.createMediaStreamDestination();
        const inputs = inputContext.createChannelMerger(2);
        const instrument = inputContext.createOscillator();
        instrument.frequency.value = 1300;
        const instrumentGain = inputContext.createGain(); instrumentGain.gain.value = 0.12;
        toneGain.connect(inputs,0,0);instrument.connect(instrumentGain).connect(inputs,0,1);
        inputs.connect(interfaceOutput);instrument.start();
        const first = {id:'mic',stream:interfaceOutput.stream,channel:1,gain:1,preset:'clean'};
        const second = {id:'keys',stream:interfaceOutput.stream,channel:2,gain:1,preset:'clean'};
        const absent = {id:'missing',stream:interfaceOutput.stream,channel:3,gain:1,preset:'clean'};
        bus.setSources([first,second,absent]);await wait(200);
        const levels = bus.readMeters();
        assert(routes===2 && levels.mic.channels===1 && levels.keys.channels===1 && !levels.missing,'Interface channels did not share capture or skipped routing');
        assert(levels.mic.left>0.72 && levels.keys.left>0.65 && levels.keys.left<levels.mic.left,'Numbered channels did not receive their own signals');
        for(let i=0;i<15;i++) bus.setSources([{...first,preset:i%2?'radio':'choir'},second]);
        await wait(150);
        const withChoir = bus.readMeters();
        assert(routes===2 && withChoir.mic.channels===2 && withChoir.keys.channels===1,'Changing presets rebuilt a capture or modified the other line');
        assert(Math.abs(withChoir.keys.left-levels.keys.left)<0.02,'Applying Choir to mic changed the instrument level');
        bus.setSources([{...first,gain:0},second]);await wait(150);
        assert(Math.abs(peak()-0.12)<0.015 && bus.readMeters().mic.left<0.02,'Muting the mic affected the instrument');
        bus.setSources([first,{...second,gain:0}]);await wait(150);
        assert(Math.abs(peak()-0.2)<0.015 && bus.readMeters().keys.left<0.02,'Muting the instrument affected the mic');
        instrument.stop();
        bus.setSources([]);
        const plugin=context.createGain(),receiver=context.createOscillator(),receiverGain=context.createGain();
        receiverGain.gain.value=0.2;receiver.connect(receiverGain);receiverGain.connect(plugin);receiver.start();
        bus.setPluginNode(plugin);await wait(100);assert(peak()>0.18,'Receiver plugin audio did not reach Program');
        bus.setMasterGain(0);await wait(150);assert(peak()<0.00001,'Mute all did not mute receiver plugin');
        bus.setMasterGain(0.5);await wait(150);const receivedPeak=peak();assert(receivedPeak>0.09&&receivedPeak<0.11,'Master did not affect receiver plugin: '+receivedPeak);
        bus.setPluginNode(null);await wait(100);assert(peak()<0.00001,'Removing plugin did not restore clean bypass');
        assert(bus.destination.stream.getAudioTracks()[0]===track&&track.readyState==='live','Program replaced or ended its audio output track');
        receiver.stop();osc.stop();await inputContext.close();bus.stop();
        return {bypassMaxSampleError:bypassError,flatMaxSampleError:flatError,bandResponseDb:gains,presets:{radioPresenceDb:change(radio,2650),leadVocalLowMidDb:change(vocal,280),choirStereoWidth:width(choir)},sharedInterfaceCapture:true,independentMutes:true,sourcePeak:originalPeak,editedSourcePeak:editedPeak,receiverMasterPeak:receivedPeak,stableAudioTrack:true};
      })()`, true);
      console.log(JSON.stringify(result));
      app.exit(0);
    } catch (error) { console.error(error); app.exit(1); }
  }).catch(error => { console.error(error); app.exit(1); });
}

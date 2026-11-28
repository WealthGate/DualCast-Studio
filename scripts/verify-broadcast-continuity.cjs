// Exercise the actual Program mixer, compositor, streaming and recording hooks
// through still/frozen pictures, TAKE, gain edits and microphone replacement.
module.exports = async function verifyBroadcastContinuity(primary, root) {
  const fs = require('fs'), path = require('path'), { spawnSync } = require('child_process');
  const result = await primary.webContents.executeJavaScript(`(async () => {
    const {default:React}=await import('/@fs/'+${JSON.stringify(root.replace(/\\/g, '/'))}+'/node_modules/.vite/deps/react.js');
    const {default:ReactDOM}=await import('/@fs/'+${JSON.stringify(root.replace(/\\/g, '/'))}+'/node_modules/.vite/deps/react-dom_client.js');
    const {useAppStore:store}=await import('/store/useAppStore.ts');
    const {useProgramStreamer}=await import('/hooks/useProgramStreamer.ts');
    const {useProgramRecorder}=await import('/hooks/useProgramRecorder.ts');
    const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
    const original={media:navigator.mediaDevices.getUserMedia, ...window.dualcast};
    const tone=new AudioContext({sampleRate:48000}),osc=tone.createOscillator(),audio=tone.createMediaStreamDestination();
    osc.connect(audio);osc.start();await tone.resume();
    navigator.mediaDevices.getUserMedia=async()=>audio.stream.clone();
    const text=id=>({id,name:id,type:'text',enabled:true,audioEnabled:false,rect:{x:0,y:0,width:100,height:100},data:{text:id}});
    const a=text('Still scene A'),b=text('Still scene B');
    store.setState({settings:{...store.getState().settings,audioMode:'none',outputResolution:'720p',qualityPreset:'low',frameRate:30,streamResolution:'720p',streamFps:30,streamAutoRecover:false,networkOutput:{...store.getState().settings.networkOutput,enabled:false},masterAudioGain:1},isFrozen:false,isCutToBlack:false,manualBlend:0,transitionType:'cut'});
    store.getState().setStudioState({scenes:[a,b].map(s=>({id:s.id,name:s.id,sourceIds:[s.id]})),sources:{[a.id]:a,[b.id]:b},groups:[],previewSceneId:b.id,programSceneId:a.id});
    await wait(400);
    const initialBus=store.getState().programAudioStream;
    if(!initialBus?.getAudioTracks().length)throw Error('Silent Program did not retain an audio output track');
    const streamChunks=[],recordChunks=[];let controller,recording,notify=()=>{},startedPayload;
    window.dualcast.onStreamStatus=handler=>{notify=handler;return()=>{};};
    window.dualcast.startStream=async payload=>{startedPayload=payload;notify({status:'connecting'});return{ok:true};};
    window.dualcast.stopStream=async()=>{notify({status:'idle'});return{ok:true};};
    window.dualcast.sendStreamChunk=async data=>{streamChunks.push(data);};
    window.dualcast.beginRecording=async()=>({sessionId:'continuity'});
    window.dualcast.appendRecordingChunk=async payload=>{recordChunks.push(payload.data);};
    window.dualcast.finishRecording=async()=>({filePath:'continuity.webm',fileName:'continuity.webm'});
    const container=document.createElement('div');document.body.append(container);
    const ref={current:document.querySelector('.program-pane canvas')};
    const {onCanvasFrame}=await import('/utils/canvasFrames.ts');
    let lastFrame=0,maxPublishedGapMs=0;const largePublishedGaps=[];
    const offFrames=onCanvasFrame(ref.current,now=>{if(lastFrame){const gap=now-lastFrame;maxPublishedGapMs=Math.max(maxPublishedGapMs,gap);if(gap>150)largePublishedGaps.push({time:now,gap});}lastFrame=now;});
    const Harness=()=>{controller=useProgramStreamer(ref);recording=useProgramRecorder(ref);return null;};
    const mounted=ReactDOM.createRoot(container);mounted.render(React.createElement(Harness));await wait(150);
    const setSettings=patch=>store.setState({settings:{...store.getState().settings,...patch}});
    try {
      if(!(await controller.startStream([{id:'test',name:'test',enabled:true,rtmpUrl:'rtmp://localhost/live',streamKey:'test'}])).ok)throw Error('Stream failed to start');
      await recording.startRecording();
      if(!startedPayload.hasAudio)throw Error('Starting with audio disabled omitted the future audio track');
      await wait(1000);setSettings({audioMode:'microphone'});await wait(2000);
      store.getState().toggleFreeze();await wait(1200);store.getState().toggleFreeze();
      store.getState().takeToProgram();await wait(1200);setSettings({masterAudioGain:0.7});await wait(1200);
      setSettings({microphoneDeviceId:'replacement-test-device'});await wait(1200);
      store.setState({isCutToBlack:true});await wait(1200);store.setState({isCutToBlack:false});await wait(1200);
      if(store.getState().programAudioStream!==initialBus||initialBus.getAudioTracks()[0].readyState!=='live')throw Error('Program replaced its live audio track');
      controller.stopStream();recording.stopRecording();await wait(500);
      if(controller.lastError||store.getState().recordingError)throw Error(controller.lastError||store.getState().recordingError);
      const concat=chunks=>{const size=chunks.reduce((n,c)=>n+c.length,0),data=new Uint8Array(size);let at=0;for(const chunk of chunks){data.set(chunk,at);at+=chunk.length;}return data;};
      return{streamData:concat(streamChunks),recordData:concat(recordChunks),stableAudioTrack:true,maxPublishedGapMs,largePublishedGaps,seconds:10.2};
    } finally {
      controller.stopStream();recording.stopRecording();await wait(100);offFrames();mounted.unmount();container.remove();
      Object.assign(window.dualcast,original);navigator.mediaDevices.getUserMedia=original.media;osc.stop();await tone.close();
    }
  })()`, true);
  const summaries = {};
  for (const [name,data] of [['stream',result.streamData],['recording',result.recordData]]) fs.writeFileSync(path.join(root,'tmp',`continuity-${name}.webm`),data);
  for (const [name, data] of [['stream', result.streamData], ['recording', result.recordData]]) {
    const file = path.join(root, 'tmp', `continuity-${name}.webm`);
    fs.writeFileSync(file, data);
    const decoded = spawnSync(require('ffmpeg-static'), ['-hide_banner','-i',file,'-vf','showinfo','-af','ashowinfo','-f','null','-'], {encoding:'utf8',windowsHide:true,maxBuffer:8*1024*1024,timeout:20000});
    if(decoded.status!==0)throw Error(name+' failed to decode: '+decoded.stderr.slice(-1500));
    const frames=[...decoded.stderr.matchAll(/Parsed_showinfo[^\n]*pts_time:([0-9.]+)/g)].map(m=>Number(m[1]));
    const audio=[...decoded.stderr.matchAll(/Parsed_ashowinfo[^\n]*pts_time:([0-9.]+)/g)].map(m=>Number(m[1]));
    const gaps=frames.slice(1).map((time,i)=>({time,gap:time-frames[i]}));
    const maxGap=Math.max(...gaps.filter(item=>item.time>1).map(item=>item.gap));
    const startupGap=Math.max(...gaps.filter(item=>item.time<=1).map(item=>item.gap));
    const drift=Math.abs(frames.at(-1)-audio.at(-1));
    const pcm=spawnSync(require('ffmpeg-static'),['-hide_banner','-loglevel','error','-i',file,'-vn','-ac','1','-ar','8000','-f','f32le','pipe:1'],{windowsHide:true,maxBuffer:4*1024*1024,timeout:20000});
    if(pcm.status!==0)throw Error(name+' audio decode failed');
    const samples=new Float32Array(pcm.stdout.buffer,pcm.stdout.byteOffset,Math.floor(pcm.stdout.length/4));
    let quietWindows=0;
    for(let start=16000;start+2000<samples.length;start+=2000){let energy=0;for(let i=start;i<start+2000;i++)energy+=samples[i]**2;if(Math.sqrt(energy/2000)<0.01)quietWindows++;}
    summaries[name]={frames:frames.length,videoSeconds:frames.at(-1),audioSeconds:audio.at(-1),maxSteadyVideoGapMs:Math.round(maxGap*1000),startupGapMs:Math.round(startupGap*1000),avDriftMs:Math.round(drift*1000),unexpectedQuietWindows:quietWindows};
    if(frames.length<270||maxGap>0.2||startupGap>0.75||drift>0.2||quietWindows)throw Error('Broadcast continuity failed: '+JSON.stringify({...summaries,maxPublishedGapMs:result.maxPublishedGapMs,largePublishedGaps:result.largePublishedGaps}));
  }
  return {stableAudioTrack:result.stableAudioTrack,...summaries};
};

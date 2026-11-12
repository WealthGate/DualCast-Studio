module.exports=async function verifyRecordingTrack(primary,root){
 const fs=require('fs'),path=require('path'),{spawnSync}=require('child_process');
 const result=await primary.webContents.executeJavaScript(`(async()=>{
  const {createStreamingCapture}=await import('/utils/streamingCapture.ts'),{publishCanvasFrame}=await import('/utils/canvasFrames.ts'),{pickRecorderMimeType}=await import('/utils/media.ts');
  const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;const ctx=canvas.getContext('2d');
  const capture=createStreamingCapture(canvas,'low',60),audio=new AudioContext({sampleRate:48000}),destination=audio.createMediaStreamDestination(),oscillator=audio.createOscillator();oscillator.connect(destination);oscillator.start();await audio.resume();
  const stream=new MediaStream([...capture.stream.getTracks(),...destination.stream.getTracks()]),mimeType=pickRecorderMimeType(),chunks=[];
  const recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:5000000});recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
  const stopped=new Promise(resolve=>{recorder.onstop=resolve;});let active=true,count=0,timer=0;const start=performance.now();
  const paint=()=>{if(!active)return;const now=performance.now();ctx.fillStyle=count%2?'#e02020':'#2050e0';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#fff';ctx.fillRect((count*13)%1200,40,60,60);publishCanvasFrame(canvas,now);count++;timer=setTimeout(paint,Math.max(1,start+count*1000/60-performance.now()));};
  recorder.start(250);paint();await new Promise(r=>setTimeout(r,6000));active=false;clearTimeout(timer);recorder.stop();await stopped;capture.stop();destination.stream.getTracks().forEach(t=>t.stop());await audio.close();
  return {data:new Uint8Array(await new Blob(chunks,{type:mimeType}).arrayBuffer()),mimeType,requestedFrames:count};
 })()`,true);
 const input=path.join(root,'tmp/recording-track.webm'),output=path.join(root,'tmp/recording-track.mp4');fs.writeFileSync(input,result.data);
 const executable=require('ffmpeg-static');
 const decode=spawnSync(executable,['-hide_banner','-i',input,'-vf','showinfo','-af','ashowinfo','-f','null','-'],{encoding:'utf8',windowsHide:true,maxBuffer:4*1024*1024});
 if(decode.status!==0)throw Error('Generated recording did not decode: '+decode.stderr.slice(-1500));
 const lines=decode.stderr.split(/\r?\n/),video=[],audio=[];
 for(const line of lines){const time=/pts_time:([0-9.]+)/.exec(line);if(!time)continue;if(line.includes('Parsed_ashowinfo'))audio.push(Number(time[1]));else if(line.includes('Parsed_showinfo'))video.push(Number(time[1]));}
 if(video.length<300||!audio.length||Math.abs(video[0]-audio[0])>.15||Math.abs(video.at(-1)-audio.at(-1))>.2)throw Error('Recording cadence or A/V timing failed: '+JSON.stringify({frames:video.length,video:[video[0],video.at(-1)],audio:[audio[0],audio.at(-1)]}));
 const copy=Buffer.from(result.data).includes(Buffer.from('V_MPEG4/ISO/AVC'));
 const remux=spawnSync(executable,['-hide_banner','-loglevel','error','-y','-i',input,'-c:v',copy?'copy':'libx264','-c:a','aac','-movflags','+faststart',output],{encoding:'utf8',windowsHide:true});
 if(remux.status!==0)throw Error('Recording MP4 export failed: '+remux.stderr);
 return {mimeType:result.mimeType,frames:video.length,requestedFrames:result.requestedFrames,videoSeconds:video.at(-1),audioSeconds:audio.at(-1),avDriftMs:Math.round(Math.abs(video.at(-1)-audio.at(-1))*1000),h264CopyExport:copy};
};

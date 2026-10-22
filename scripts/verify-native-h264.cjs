module.exports=async function verifyNativeH264(root){
 if(process.platform!=='win32')return {platform:process.platform,nativeBackend:'Chromium'};
 const {BrowserWindow,desktopCapturer,ipcMain}=require('electron');const fs=require('fs'),path=require('path');
 const cp=require('child_process'),originalSpawn=cp.spawn;let stderr='';
 cp.spawn=function(executable,args,...options){const native=args.some(arg=>String(arg).startsWith('gfxcapture='));const actual=[...args];if(native){actual[actual.indexOf('-loglevel')+1]='info';actual.unshift('-stats','-stats_period','0.5');}const child=originalSpawn.call(this,executable,actual,...options);if(native)child.stderr.on('data',chunk=>{stderr=(stderr+chunk.toString()).slice(-5000);});return child;};
 const service=require(path.join(root,'tmp/capture-verification.cjs'));
 const start=(event,id,fps,options)=>service.startCursorFreeCapture(event.sender,id,fps,options),stop=(event,id)=>service.stopCursorFreeCapture(id,event.sender.id);
 let acknowledgements=0;const ack=(event,id,sequence)=>{acknowledgements++;service.acknowledgeCursorFreeFrame(event.sender.id,id,sequence);};
 ipcMain.handle('dualcast:start-cursor-free-capture',start);ipcMain.handle('dualcast:stop-cursor-free-capture',stop);ipcMain.on('dualcast:cursor-free-frame-presented',ack);
 fs.copyFileSync(path.join(root,'dist-electron/preload.js'),path.join(root,'tmp/preload.js'));
 fs.writeFileSync(path.join(root,'tmp/native-h264.html'),'<!doctype html><title>Native capture consumer</title><body></body>');
 const target=new BrowserWindow({show:false,width:1280,height:720,webPreferences:{backgroundThrottling:false}});
 const view=new BrowserWindow({show:false,webPreferences:{backgroundThrottling:false,contextIsolation:true,preload:path.join(root,'tmp/preload.js')}});
 let packets=0,bytes=0,jpegs=0;
 const send=view.webContents.send;
 view.webContents.send=function(channel,frame,...args){if(channel==='dualcast:cursor-free-frame'){if(frame.data){packets++;bytes+=frame.data.byteLength;}if(frame.dataUrl)jpegs++;}return send.call(this,channel,frame,...args);};
 try{
  await target.loadURL("data:text/html,"+encodeURIComponent("<title>Hardware capture verification</title><body style='margin:0;background:red'><canvas id='motion' width='1280' height='720'></canvas><script>const c=document.querySelector('canvas').getContext('2d');let t=0;setInterval(()=>{c.fillStyle='rgb('+(160+(t++%90))+',0,0)';c.fillRect(0,0,1280,720);c.fillStyle='white';c.fillRect((t*8)%1200,20,40,40);},16)</script>"));target.showInactive();
  const listed=await desktopCapturer.getSources({types:['window'],thumbnailSize:{width:0,height:0}});const source=listed.find(item=>item.name==='Hardware capture verification');if(!source)throw Error('Hardware capture source missing');
  await view.loadURL('http://127.0.0.1:5174/@fs/'+path.join(root,'tmp/native-h264.html').replace(/\\/g,'/'));
  const result=await view.webContents.executeJavaScript(`(async()=>{const {getCursorFreeStream,getNativeCaptureCanvas,nativeCaptureVersion}=await import('/utils/cursorFreeCapture.ts');const wait=ms=>new Promise(r=>setTimeout(r,ms));const stream=await getCursorFreeStream(${JSON.stringify(source.id)},60,1920,1080,'auto');if(!stream)throw Error('Native hardware capture missing');const canvas=getNativeCaptureCanvas(stream);await wait(500);const before=nativeCaptureVersion(canvas),start=performance.now();await wait(2200);const fps=(nativeCaptureVersion(canvas)-before)/((performance.now()-start)/1000);const pixel=[...canvas.getContext('2d').getImageData(canvas.width/2,canvas.height/2,1,1).data];stream.getTracks().forEach(t=>t.stop());return {fps:Number(fps.toFixed(1)),width:canvas.width,height:canvas.height,pixel};})()`);
  if(!packets||jpegs||result.fps<10||result.pixel[0]<100||result.pixel[2]>50)throw Error('Native H.264 pipeline failed: '+JSON.stringify({...result,packets,jpegs,acknowledgements,stderr}));
  return {...result,packets,bytes,jpegs,binaryVideo:true};
 }finally{cp.spawn=originalSpawn;service.stopAllCursorFreeCaptures();target.destroy();view.destroy();ipcMain.removeHandler('dualcast:start-cursor-free-capture');ipcMain.removeHandler('dualcast:stop-cursor-free-capture');ipcMain.removeListener('dualcast:cursor-free-frame-presented',ack);}
};

module.exports=async function verifyProjectionVideo(primary,root){
 const {BrowserWindow,ipcMain,screen}=require('electron'),path=require('path'),fs=require('fs');
 const displayId=String(screen.getPrimaryDisplay().id);
 const service=require(path.join(root,'tmp/projection-verification.cjs'));
 fs.copyFileSync(path.join(root,'dist-electron/preload.js'),path.join(root,'tmp/preload.js'));
 process.env.VITE_DEV_SERVER_URL='http://127.0.0.1:5174';
 const originalSend=primary.webContents.send,show=BrowserWindow.prototype.show;let readySignals=0;
 const route=(event,signal)=>{if(signal.type==='ready')readySignals++;service.routeProjectionSignal(event.sender,signal);};
 const video=(event,frame)=>service.forwardProgramVideo(event.sender,frame),ack=(event,sequence)=>service.acknowledgeProgramVideo(event.sender.id,sequence);
 const listener=event=>{if(event.message.startsWith('PROJECTION_TEST_SIGNAL:'))service.routeProjectionSignal(primary.webContents,JSON.parse(event.message.slice(23)));};
 ipcMain.on('dualcast:projection-signal',route);ipcMain.on('dualcast:program-video-frame',video);ipcMain.on('dualcast:program-video-presented',ack);
 ipcMain.handle('dualcast:get-program-state',()=>service.getProgramState());primary.webContents.on('console-message',listener);
 primary.webContents.send=function(channel,signal){if(channel==='dualcast:projection-signal')void primary.webContents.executeJavaScript(`window.__projectionTestSignal?.(${JSON.stringify(signal)})`).catch(()=>{});else originalSend.call(this,channel,signal);};
 BrowserWindow.prototype.show=function(){if(this===primary)show.call(this);};
 let output;
 try{
  await primary.webContents.executeJavaScript(`(async()=>{const {store,wait}=window.__transitionCheck;window.__projectionTestRestore={send:window.dualcast.sendProjectionSignal,on:window.dualcast.onProjectionSignal,video:window.dualcast.sendProgramVideoFrame,settings:store.getState().settings};window.dualcast.onProjectionSignal=h=>{window.__projectionTestSignal=h;return()=>{window.__projectionTestSignal=null;};};window.dualcast.sendProjectionSignal=s=>console.log('PROJECTION_TEST_SIGNAL:'+JSON.stringify(s));window.dualcast.sendProgramVideoFrame=frame=>window.__outputTest.send(frame);store.setState({settings:{...store.getState().settings,sanctuaryDisplay:{...store.getState().settings.sanctuaryDisplay,mode:'independent'}}});await wait(50);store.setState({isCutToBlack:false,settings:{...store.getState().settings,frameRate:30,networkOutput:{...store.getState().settings.networkOutput,enabled:false},sanctuaryDisplay:{...store.getState().settings.sanctuaryDisplay,mode:'program'}}});await wait(50);})()`);
  await primary.webContents.executeJavaScript(`(async()=>{const {store}=window.__transitionCheck;const {useConnectedDisplays}=await import('/store/useConnectedDisplays.ts');window.__projectionTestRestore.displays=useConnectedDisplays.getState().displays;useConnectedDisplays.setState({displays:[{id:${JSON.stringify(displayId)},name:'Verification screen',isPrimary:true,size:{width:1920,height:1080}}],loading:false,error:null});window.__projectionTestRestore.targets=store.getState().projectionTargetIds;window.__projectionTestRestore.projecting=store.getState().isProjecting;store.setState({projectionTargetIds:[${JSON.stringify(displayId)}],isProjecting:true});await new Promise(resolve=>setTimeout(resolve,100));})()`);
  const state={programSceneId:'performance',isFrozen:false,isCutToBlack:false,qualityPreset:'medium',frameRate:30};service.setProgramState(state);await service.openProjectionWindows([displayId]);
  output=BrowserWindow.getAllWindows().find(window=>window!==primary&&window.webContents.getURL().includes('projection=program'));if(!output)throw Error('Output window missing');
  await output.webContents.executeJavaScript(`(()=>{window.__decoded=0;const original=CanvasRenderingContext2D.prototype.drawImage;CanvasRenderingContext2D.prototype.drawImage=function(image,...args){if(image instanceof VideoFrame){window.__decoded++;window.__dimensions={width:image.displayWidth,height:image.displayHeight};}return original.call(this,image,...args);};})()`);
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms)),decoded=()=>output.webContents.executeJavaScript('window.__decoded');
  for(let i=0;i<160&&!(await decoded());i++)await wait(30);if(!(await decoded()))throw Error('Hardware encoded display did not render through production IPC');
  const dimensions=await output.webContents.executeJavaScript('window.__dimensions');
  const pixel=()=>output.webContents.executeJavaScript(`(()=>{const c=document.querySelector('.projection-canvas');return [...c.getContext('2d').getImageData(c.width/2,c.height/2,1,1).data];})()`);
  service.setProgramState({...state,isCutToBlack:true});await wait(100);if((await pixel()).slice(0,3).some(v=>v>0))throw Error('Cut to black did not hide encoded video');
  service.setProgramState(state);await wait(100);if((await pixel()).slice(0,3).every(v=>v===0))throw Error('Restore lost the encoded picture');
  await output.webContents.executeJavaScript(`window.__decode=VideoDecoder.prototype.decode;VideoDecoder.prototype.decode=function(){};void 0;`);
  const previousReady=readySignals;for(let i=0;i<70&&readySignals===previousReady;i++)await wait(30);if(readySignals===previousReady)throw Error('Stalled output did not request a fresh keyframe');
  const before=await decoded();await output.webContents.executeJavaScript('VideoDecoder.prototype.decode=window.__decode;void 0;');
  for(let i=0;i<100&&(await decoded())===before;i++)await wait(30);if((await decoded())===before)throw Error('Encoded output did not recover');
  return {connected:true,dimensions,cutBlackRestore:true,connectedStallRecovery:true,productionPreloadAndRouter:true,singleHardwareEncoder:true};
 }finally{
  await service.closeProjectionWindows();
  await primary.webContents.executeJavaScript(`(async()=>{const {store,wait}=window.__transitionCheck,s=window.__projectionTestRestore;if(!s)return;store.setState({settings:{...store.getState().settings,sanctuaryDisplay:{...store.getState().settings.sanctuaryDisplay,mode:'independent'}}});await wait(50);window.dualcast.sendProjectionSignal=s.send;window.dualcast.onProjectionSignal=s.on;window.dualcast.sendProgramVideoFrame=s.video;store.setState({settings:s.settings});})()`).catch(()=>{});
  await primary.webContents.executeJavaScript(`(async()=>{const s=window.__projectionTestRestore;if(s){const {useConnectedDisplays}=await import('/store/useConnectedDisplays.ts');if(s.displays)useConnectedDisplays.setState({displays:s.displays});window.__transitionCheck.store.setState({projectionTargetIds:s.targets,isProjecting:s.projecting});}})()`).catch(()=>{});
  BrowserWindow.prototype.show=show;primary.webContents.send=originalSend;primary.webContents.removeListener('console-message',listener);
  ipcMain.removeListener('dualcast:projection-signal',route);ipcMain.removeListener('dualcast:program-video-frame',video);ipcMain.removeListener('dualcast:program-video-presented',ack);ipcMain.removeHandler('dualcast:get-program-state');
 }
};

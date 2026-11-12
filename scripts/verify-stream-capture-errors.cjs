module.exports = async function verifyStreamCaptureErrors(rootPath, autoRecover = false) {
  const { default: React } = await import('/@fs/'+rootPath+'/node_modules/.vite/deps/react.js');
  const { default: ReactDOM } = await import('/@fs/'+rootPath+'/node_modules/.vite/deps/react-dom_client.js');
  const { useProgramStreamer } = await import('/hooks/useProgramStreamer.ts');
  const { useAppStore: store } = await import('/store/useAppStore.ts');
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const previous = { start:window.dualcast.startStream,stop:window.dualcast.stopStream,on:window.dualcast.onStreamStatus,settings:store.getState().settings,recorder:window.MediaRecorder };
  let notify=()=>{}, controller, recorder, stops=0, starts=0;const payloads=[];
  window.dualcast.onStreamStatus = handler => { notify=handler; return()=>{}; };
  window.dualcast.startStream = async payload => {starts++;payloads.push(payload);notify({status:'connecting',startedAt:null,lastError:null});return {ok:true};};
  window.dualcast.stopStream = async () => {stops++;notify({status:'idle',startedAt:null,lastError:null});return {ok:true};};
  window.MediaRecorder = class extends previous.recorder { constructor(...args) { super(...args); recorder=this; } };
  const source={id:'stream-error',name:'Test',type:'text',enabled:true,audioEnabled:false,rect:{x:0,y:0,width:100,height:100},data:{text:'Stream test'}};
  const scene={id:'stream-error',name:'Test',sourceIds:[source.id]};
  store.setState({settings:{...previous.settings,audioMode:'none',streamResolution:'1080p',streamFps:30,streamAutoRecover:autoRecover}});
  store.getState().setStudioState({scenes:[scene],sources:{[source.id]:source},groups:[],previewSceneId:scene.id,programSceneId:scene.id});
  const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;
  const ref={current:canvas},container=document.createElement('div');document.body.append(container);
  const Component=()=>{controller=useProgramStreamer(ref);return null;};
  const root=ReactDOM.createRoot(container);root.render(React.createElement(Component));
  const destinations=[{id:'local',name:'Local mock',enabled:true,rtmpUrl:'rtmp://localhost/live',streamKey:'test'}];
  try {
    for(let i=0;i<50&&!controller;i++)await wait(20);
    if(!(await controller.startStream(destinations)).ok)throw Error('Hook did not start');
    if(autoRecover){
      const first=recorder;
      notify({status:'reconnecting',restartRequired:true,reduceLoad:true,message:'Simulated repeated output congestion'});
      await wait(2100);
      if(starts!==2||recorder===first||recorder.state!=='recording')throw Error('Fresh capture did not reconnect automatically: '+starts);
      if(payloads[1].resolution!=='720p'||payloads[1].preset!=='low')throw Error('Output congestion did not immediately lower bandwidth');
      if(payloads[1].fps!==30||payloads[1].audioBitrate!==previous.settings.streamAudioBitrate)throw Error('First recovery changed audio quality or used the wrong frame rate');
      notify({status:'live',startedAt:Date.now(),lastError:null});await wait(50);
      notify({status:'reconnecting',restartRequired:true,message:'Second input stall'});
      await wait(3800);
      if(starts!==3||payloads[2].resolution!=='720p'||payloads[2].preset!=='low')throw Error('Repeated stall did not reduce stream load');
      if(payloads[2].fps!==15||payloads[2].audioBitrate!==payloads[1].audioBitrate)throw Error('Repeated congestion did not progressively reduce video load while retaining audio quality');
      notify({status:'live',startedAt:Date.now(),lastError:null});await wait(50);
      notify({status:'reconnecting',restartRequired:true,message:'Third input stall'});await wait(100);
      controller.stopStream();await wait(3400);
      if(starts!==3)throw Error('Manual Stop did not cancel pending recovery');
      return {automaticRecovery:true,freshRecorder:true,outputCongestionReducesLoad:true,repeatedStallReducesLoad:true,manualStopCancelsRetry:true};
    }
    recorder.onerror(new ErrorEvent('error',{error:new Error('test encoder failure')}));
    await wait(250);
    if(stops!==1||controller.status!=='error'||!controller.lastError?.includes('test encoder failure'))throw Error('Capture error disappeared during automatic stop');
    if(!(await controller.startStream(destinations)).ok)throw Error('Failed stream could not restart');
    await wait(100);
    if(controller.lastError)throw Error('Previous capture failure survived a new start');
    recorder.stop();await wait(250);
    if(stops!==2||controller.status!=='error'||!controller.lastError?.includes('stopped unexpectedly'))throw Error('Unexpected capture stop left the backend active');
    return {captureErrorRetained:true,retryClearsError:true,unexpectedStopCleansBackend:true};
  } finally {
    if(recorder?.state!=='inactive')recorder?.stop();await wait(50);root.unmount();container.remove();
    window.MediaRecorder=previous.recorder;window.dualcast.startStream=previous.start;window.dualcast.stopStream=previous.stop;window.dualcast.onStreamStatus=previous.on;
    store.setState({settings:previous.settings});store.getState().setStudioState({scenes:[],sources:{},groups:[],previewSceneId:null,programSceneId:null});
  }
};

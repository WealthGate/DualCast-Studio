module.exports = async function verifyStreamCaptureErrors(rootPath) {
  const { default: React } = await import('/@fs/'+rootPath+'/node_modules/.vite/deps/react.js');
  const { default: ReactDOM } = await import('/@fs/'+rootPath+'/node_modules/.vite/deps/react-dom_client.js');
  const { useProgramStreamer } = await import('/hooks/useProgramStreamer.ts');
  const { useAppStore: store } = await import('/store/useAppStore.ts');
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const previous = { start:window.dualcast.startStream,stop:window.dualcast.stopStream,on:window.dualcast.onStreamStatus,settings:store.getState().settings,recorder:window.MediaRecorder };
  let notify=()=>{}, controller, recorder, stops=0;
  window.dualcast.onStreamStatus = handler => { notify=handler; return()=>{}; };
  window.dualcast.startStream = async () => {notify({status:'connecting',startedAt:null,lastError:null});return {ok:true};};
  window.dualcast.stopStream = async () => {stops++;notify({status:'idle',startedAt:null,lastError:null});return {ok:true};};
  window.MediaRecorder = class extends previous.recorder { constructor(...args) { super(...args); recorder=this; } };
  const source={id:'stream-error',name:'Test',type:'text',enabled:true,audioEnabled:false,rect:{x:0,y:0,width:100,height:100},data:{text:'Stream test'}};
  const scene={id:'stream-error',name:'Test',sourceIds:[source.id]};
  store.setState({settings:{...previous.settings,audioMode:'none',streamResolution:'720p',streamFps:30}});
  store.getState().setStudioState({scenes:[scene],sources:{[source.id]:source},groups:[],previewSceneId:scene.id,programSceneId:scene.id});
  const canvas=document.createElement('canvas');canvas.width=320;canvas.height=180;
  const ref={current:canvas},container=document.createElement('div');document.body.append(container);
  const Component=()=>{controller=useProgramStreamer(ref);return null;};
  const root=ReactDOM.createRoot(container);root.render(React.createElement(Component));
  const destinations=[{id:'local',name:'Local mock',enabled:true,rtmpUrl:'rtmp://localhost/live',streamKey:'test'}];
  try {
    for(let i=0;i<50&&!controller;i++)await wait(20);
    if(!(await controller.startStream(destinations)).ok)throw Error('Hook did not start');
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

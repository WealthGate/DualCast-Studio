module.exports = async function verifyNativeRenderer() {
  const {store,wait}=window.__transitionCheck;
  const bridge=window.dualcast;
  const previous={start:bridge.startCursorFreeCapture,stop:bridge.stopCursorFreeCapture,on:bridge.onCursorFreeFrame};
  const create=document.createElement.bind(document), videos=[];
  document.createElement=function(name,...args){const element=create(name,...args);if(name==='video') videos.push(element);return element;};
  const image=create('canvas');image.width=640;image.height=360;const ctx=image.getContext('2d');
  const frames=['red','blue'].map(color=>{ctx.fillStyle=color;ctx.fillRect(0,0,640,360);return image.toDataURL('image/jpeg',.8);});
  let receive=()=>{}, starts=0, stopped=0, active=true;
  bridge.onCursorFreeFrame=handler=>{receive=handler;return()=>{receive=()=>{};};};
  bridge.startCursorFreeCapture=async()=>{starts++;return 'native-renderer-test';};
  bridge.stopCursorFreeCapture=async()=>{stopped++;};
  const source={id:'native-test',name:'Native test',type:'window',enabled:true,audioEnabled:false,rect:{x:0,y:0,width:100,height:100},data:{captureId:'window:42:0'}};
  const duplicate={...source,id:'native-duplicate',rect:{x:0,y:0,width:20,height:20}};
  const scene={id:'native-test-scene',name:'Native capture',sourceIds:[source.id,duplicate.id]};
  let sent=0;
  const feed=(async()=>{while(active){await wait(33);await receive({id:'native-renderer-test',dataUrl:frames[sent++%2]});}})();
  try {
    store.getState().setStudioState({scenes:[scene],sources:{[source.id]:source,[duplicate.id]:duplicate},groups:[],previewSceneId:scene.id,programSceneId:scene.id});
    await wait(600);
    const canvas=document.querySelector('.program-pane canvas'), context=canvas.getContext('2d');
    let changes=0, last=-1;
    for(let i=0;i<40;i++){await wait(40);const pixel=context.getImageData(canvas.width/2,canvas.height/2,1,1).data;const color=pixel[0]>pixel[2]?0:1;if(last!==color)changes++;last=color;}
    if(starts!==1) throw Error('Duplicate window sources started '+starts+' native encoders');
    if(videos.some(video=>video.srcObject)) throw Error('Native capture still passes through a hidden video player');
    if(changes<10) throw Error('Native decoded frames stopped advancing in Program: '+changes);
    return {nativeEncoders:starts,hiddenVideoQueues:0,movingPictureChanges:changes};
  } finally {
    active=false;await feed;
    store.getState().setStudioState({scenes:[],sources:{},groups:[],previewSceneId:null,programSceneId:null});
    await wait(50);
    bridge.startCursorFreeCapture=previous.start;bridge.stopCursorFreeCapture=previous.stop;bridge.onCursorFreeFrame=previous.on;
    document.createElement=create;
    if(!stopped) throw Error('Native renderer verification did not release capture');
  }
};

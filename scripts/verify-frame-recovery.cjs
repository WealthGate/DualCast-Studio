module.exports = async function verifyFrameRecovery() {
  const { store, wait } = window.__transitionCheck;
  const media = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
  const create = document.createElement.bind(document);
  let sourceVideo;
  document.createElement = function(name, ...args) { const element = create(name, ...args); if (name === 'video') sourceVideo = element; return element; };
  const camera = {id:'recovery-cam',name:'Recovery camera',type:'camera',enabled:true,audioEnabled:false,rect:{x:0,y:0,width:100,height:100},data:{deviceId:''}};
  const scene = {id:'recovery',name:'Recovery',sourceIds:[camera.id]};
  const settings = store.getState().settings;
  let previewDraws = 0, programDraws = 0;
  let previewContext, programContext, previewFill, programFill;
  try {
    store.setState({isFrozen:false,isCutToBlack:false,manualBlend:0,settings:{...settings,qualityPreset:'low',frameRate:30}});
    store.getState().setStudioState({scenes:[scene],sources:{[camera.id]:camera},groups:[],previewSceneId:scene.id,programSceneId:scene.id});
    for(let i=0;i<100 && !(sourceVideo?.readyState>=2);i++) await wait(30);
    if (!(sourceVideo?.readyState>=2)) throw Error('Recovery test camera did not start');
    await wait(200);
    previewContext=document.querySelector('.preview-pane canvas').getContext('2d');
    programContext=document.querySelector('.program-pane canvas').getContext('2d');
    previewFill=previewContext.fillRect; programFill=programContext.fillRect;
    previewContext.fillRect=function(...args){previewDraws++;return previewFill.apply(this,args);};
    programContext.fillRect=function(...args){programDraws++;return programFill.apply(this,args);};
    await wait(400);
    const minimumPreview=Math.max(3,previewDraws*2),minimumProgram=Math.max(3,programDraws*2);
    previewDraws=programDraws=0;
    // Simulate HAVE_METADATA during buffering AFTER a scene has gone live.
    Object.defineProperty(sourceVideo,'readyState',{configurable:true,get:()=>1});
    await wait(1600);
    if(previewDraws<minimumPreview||programDraws<minimumProgram) throw Error('A buffering source froze the entire scene: '+JSON.stringify({previewDraws,programDraws}));
    delete sourceVideo.readyState; await wait(200);
    // A new, permanently unavailable overlay must not freeze the healthy camera.
    const unavailable={id:'never-ready',name:'Unavailable',type:'image',enabled:true,audioEnabled:false,rect:{x:80,y:80,width:10,height:10},data:{url:'data:image/png;base64,invalid'}};
    store.getState().setStudioState({scenes:[{...scene,sourceIds:[camera.id,unavailable.id]}],sources:{[camera.id]:camera,[unavailable.id]:unavailable},groups:[],previewSceneId:scene.id,programSceneId:scene.id});
    previewDraws=programDraws=0; await wait(1800);
    if(previewDraws<minimumPreview||programDraws<minimumProgram) throw Error('An unavailable overlay froze healthy layers: '+JSON.stringify({previewDraws,programDraws,samePreview:previewContext.canvas===document.querySelector('.preview-pane canvas'),sameProgram:programContext.canvas===document.querySelector('.program-pane canvas'),status:document.querySelector('[role=status]')?.textContent,alerts:[...document.querySelectorAll('[role=alert]')].map(e=>e.textContent),ready:sourceVideo.readyState,scene:store.getState().programSceneSnapshot}));
    return {bufferingSource:'other layers continue',unavailableOverlay:'other layers continue',previewDraws,programDraws};
  } finally {
    if(sourceVideo) delete sourceVideo.readyState;
    if(previewContext) previewContext.fillRect=previewFill;
    if(programContext) programContext.fillRect=programFill;
    document.createElement=create; navigator.mediaDevices.getUserMedia=media;
    store.setState({settings});
  }
};

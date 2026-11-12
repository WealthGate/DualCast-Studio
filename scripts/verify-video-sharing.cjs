module.exports = async function verifyVideoSharing(url) {
  const { useAppStore: store } = await import('/store/useAppStore.ts');
  const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
  const create = document.createElement.bind(document), videos = [];
  document.createElement = function(name, ...args) { const element = create(name, ...args); if(name === 'video') videos.push(element); return element; };
  const source = {id:'shared-file',name:'Shared video',type:'video',enabled:true,audioEnabled:false,rect:{x:0,y:0,width:100,height:100},media:{paused:false,restartToken:0},data:{url:url+'#sharing-check',loop:true}};
  const scene = {id:'shared-file-scene',name:'Shared file video',sourceIds:[source.id]};
  try {
    store.getState().setStudioState({scenes:[scene],sources:{[source.id]:source},groups:[],programSceneId:scene.id,previewSceneId:scene.id});
    for(let i=0;i<100&&!(videos[0]?.currentTime>.3);i++) await wait(30);
    if(videos.length!==1||!(videos[0].currentTime>.3)) throw Error('Matching file playback did not share one active decoder: '+videos.length);
    const live = videos[0], before = live.currentTime;
    store.getState().setSourceMediaPaused(source.id,true);
    for(let i=0;i<100&&!(videos[1]?.readyState>=2);i++) await wait(30);
    await wait(250);
    if(videos.length!==2||!videos[1].paused||live.paused||live.currentTime<=before) throw Error('Preview pause changed live playback or resumed while loading');
    const pausedAt = videos[1].currentTime;
    await wait(250);
    if(Math.abs(videos[1].currentTime-pausedAt)>.05) throw Error('Paused Preview continued moving');
    return {sharedDecoders:1,pausedPreviewForks:true,programKeepsPlaying:true};
  } finally {
    document.createElement = create;
    store.getState().setStudioState({scenes:[],sources:{},groups:[],previewSceneId:null,programSceneId:null});
    await wait(50);
  }
};

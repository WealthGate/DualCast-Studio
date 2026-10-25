// Real React controls, live Program canvas, transparent lower-third frames,
// Scripture selection/jump, six rendered presets, and real settings persistence.
module.exports = async function verifyDesigner(primary, rootPath) {
  const root = rootPath.replace(/\\/g, '/');
  const result = await primary.webContents.executeJavaScript(`(async()=>{
    const {useAppStore:store}=await import('/store/useAppStore.ts');
    const {default:React}=await import('/@fs/'+${JSON.stringify(root)}+'/node_modules/.vite/deps/react.js');
    const {default:ReactDOM}=await import('/@fs/'+${JSON.stringify(root)}+'/node_modules/.vite/deps/react-dom_client.js');
    const {default:Panel}=await import('/components/LowerThirdPanel.tsx');
    const {default:Scripture}=await import('/components/ScripturePanel.tsx');
    const {drawDesignerLowerThird:draw}=await import('/utils/designerLowerThird.ts');
    const {lowerThirdDesignPresets:presets,lowerThirdTitle}=await import('/@fs/'+${JSON.stringify(root)}+'/src/shared/lowerThirdDesign.ts');
    const wait=ms=>new Promise(r=>setTimeout(r,ms)),assert=(v,m)=>{if(!v)throw Error(m)};
    const until=async(fn,label)=>{for(let i=0;i<180;i++){if(await fn())return;await wait(30)}throw Error('Timed out: '+label)};
    await wait(500);
    const logoCanvas=document.createElement('canvas');logoCanvas.width=96;logoCanvas.height=48;const lc=logoCanvas.getContext('2d');lc.fillStyle='#ff00ff';lc.fillRect(0,0,96,48);lc.fillStyle='white';lc.fillRect(8,16,80,16);
    const logoUrl=logoCanvas.toDataURL(),logo=new Image();logo.src=logoUrl;await logo.decode();
    const scene={id:'design-scene',name:'Designer verification',sourceIds:[]};
    store.setState({scenes:[scene],sources:{},programSceneSnapshot:scene,programSources:{},previewSceneId:scene.id,programSceneId:scene.id,isFrozen:false,isCutToBlack:false,displayTextMode:'show',isLowerThirdHidden:false,settings:{...store.getState().settings,audioMode:'none',lowerThird:{...store.getState().settings.lowerThird,mode:'classic',imageUrl:logoUrl,fontSize:47,backgroundColor:'#172b3c',slides:[],activeSlideId:null,programSlideId:null}}});
    const classicFont=store.getState().settings.lowerThird.fontSize,classicBackground=store.getState().settings.lowerThird.backgroundColor;
    const box=document.createElement('div');box.style.cssText='position:fixed;z-index:99999;top:10px;left:10px;width:320px;height:850px;overflow:auto;background:#141c28;padding:10px';document.body.append(box);
    let mounted=ReactDOM.createRoot(box);mounted.render(React.createElement(Panel));await wait(150);
    const button=label=>[...box.querySelectorAll('button')].find(b=>b.textContent===label);
    const click=async label=>{await until(()=>button(label)&&!button(label).disabled,'button '+label);button(label).click();await wait(30)};
    const input=(label,value)=>{const e=box.querySelector('[aria-label="'+label+'"]');assert(e,'Missing control '+label);const proto=e instanceof HTMLSelectElement?HTMLSelectElement.prototype:e instanceof HTMLTextAreaElement?HTMLTextAreaElement.prototype:HTMLInputElement.prototype;Object.getOwnPropertyDescriptor(proto,'value').set.call(e,value);e.dispatchEvent(new Event(e instanceof HTMLSelectElement?'change':'input',{bubbles:true}));};
    const config=()=>store.getState().settings.lowerThird, live=()=>config().slides.find(s=>s.id===config().programSlideId);
    const program=()=>document.querySelector('.program-pane canvas');
    const pixels=()=>program().getContext('2d').getImageData(0,0,program().width,program().height).data;
    const countColor=(data,r,g,b)=>{let n=0;for(let i=0;i<data.length;i+=4)if(Math.abs(data[i]-r)<12&&Math.abs(data[i+1]-g)<12&&Math.abs(data[i+2]-b)<12&&data[i+3]>200)n++;return n};
    try{
      await click('Designer · Title + Content');await until(()=>box.querySelectorAll('.designer-preset').length===6,'designer gallery');
      box.querySelectorAll('.designer-preset')[0].click();await wait(80);
      input('Designer title','A MESSAGE OF HOPE');input('Designer content','Welcome to OpenChurch');await wait(50);
      await click('Show card live');await until(()=>live()?.text==='Welcome to OpenChurch','first live card');
      const originalId=config().programSlideId;
      input('Designer title','PEACE AND PURPOSE');input('Designer content','The title and description change together');await wait(50);await click('Update live');await until(()=>live()?.title==='PEACE AND PURPOSE','explicit live update');
      assert(config().programSlideId===originalId,'Live edit replayed a new cue ID');
      const toggle=box.querySelector('.designer-live-toggle input');await until(()=>!toggle.disabled,'live typing ready');toggle.click();await wait(30);input('Designer content','Live lyrics update without another TAKE');await until(()=>live()?.text==='Live lyrics update without another TAKE','live typing');
      await until(()=>!toggle.disabled,'live typing update saved');toggle.click();await wait(30);input('Designer content','Private draft stays in Preview');await wait(240);assert(live().text==='Live lyrics update without another TAKE','Typing went live without opt-in');
      await click('Cue in Preview');await until(()=>config().activeSlideId!==config().programSlideId,'preview copy');assert(live().text==='Live lyrics update without another TAKE','Preview overwrote Program');
      await click('Show card live');await until(()=>live()?.text==='Private draft stays in Preview','take draft live');
      const titleBodyBefore=structuredClone(config().design.content);input('Title text color','#ffde00');await wait(80);assert(Object.keys(titleBodyBefore).every(key=>config().design.content[key]===titleBodyBefore[key]),'Title styling changed body');
      input('Content text color','#00ff00');await wait(100);
      await until(()=>{const data=pixels();return countColor(data,255,222,0)>20&&countColor(data,0,255,0)>20&&countColor(data,255,0,255)>50},'independent title/body colors and shared logo on Program');
      const programFrame=program().toDataURL();
      const sheet=document.createElement('canvas');sheet.width=1920;sheet.height=1050;const sx=sheet.getContext('2d');sx.fillStyle='#0b1220';sx.fillRect(0,0,1920,1050);
      const presetImages=[];
      for(let i=0;i<presets.length;i++){
        const c=document.createElement('canvas');c.width=1920;c.height=1080;const x=c.getContext('2d');
        const cfg={...config(),heightPercent:28,position:'bottom',design:presets[i].design};const slide={id:'render',title:i===5?'GREAT IS YOUR FAITHFULNESS':'WELCOME TO OPENCHURCH',text:i===5?'Morning by morning, new mercies I see':'A place to belong. A message of hope.'};
        draw(x,c.width,c.height,cfg,slide,logo);const data=x.getImageData(0,0,c.width,c.height).data;
        assert(countColor(data,255,0,255)>100,'Preset lost shared logo: '+presets[i].name);
        assert(x.getImageData(0,0,1,1).data[3]===0,'Preset filled outside its lower-third band');
        presetImages.push(c.toDataURL());const px=(i%2)*960+25,py=Math.floor(i/2)*350;sx.fillStyle='#c0cedd';sx.font='600 24px Segoe UI';sx.fillText(presets[i].name,px,py+40);sx.drawImage(c,0,690,1920,390,px,py+60,910,185);
        for(const anim of ['fade','reveal','spring','slide-left','slide-right','slide-up','slide-down','zoom','wipe']){
          x.clearRect(0,0,c.width,c.height);draw(x,c.width,c.height,cfg,slide,logo,anim,'enter',0);assert(!x.getImageData(0,0,c.width,c.height).data.some((v,n)=>n%4===3&&v),'Entrance not hidden at start: '+anim);
          x.clearRect(0,0,c.width,c.height);draw(x,c.width,c.height,cfg,slide,logo,anim,'exit',1);assert(!x.getImageData(0,0,c.width,c.height).data.some((v,n)=>n%4===3&&v),'Exit did not clear: '+anim);
        }
      }
      assert(new Set(presetImages).size===6,'Presets are visually identical');
      assert(box.scrollWidth<=box.clientWidth+2,'Designer controls overflow 320px dock');
      let frames=[];const oldFrame=window.dualcast.sendLowerThirdFrame;window.dualcast.sendLowerThirdFrame=frame=>frames.push(frame);
      await store.getState().updateSettings({lowerThird:{...config(),entranceAnimation:'none',exitAnimation:'reveal',animationDurationMs:600}});store.setState({isLowerThirdProjecting:true});await until(()=>frames.length>1,'transparent output frames');
      const decode=async frame=>{const i=new Image();i.src=frame;await i.decode();const c=document.createElement('canvas');c.width=i.width;c.height=i.height;const x=c.getContext('2d');x.drawImage(i,0,0);return {x,c}};
      let output=await decode(frames.at(-1));assert(output.x.getImageData(0,0,1,1).data[3]===0,'Standalone output lost transparency');
      await store.getState().clearProgramText();await wait(180);output=await decode(frames.at(-1));assert(output.x.getImageData(0,0,output.c.width,output.c.height).data.some((v,i)=>i%4===3&&v),'Exit cut immediately');
      await wait(650);output=await decode(frames.at(-1));assert(!output.x.getImageData(0,0,output.c.width,output.c.height).data.some((v,i)=>i%4===3&&v),'Exit retained pixels');store.setState({isLowerThirdProjecting:false});window.dualcast.sendLowerThirdFrame=oldFrame;
      const song={id:'song-design',text:'Amazing grace, how sweet the sound',kind:'song',deckTitle:'Amazing Grace'};await store.getState().stageLowerThird([...config().slides,song],song.id,true);assert(lowerThirdTitle(live())==='Amazing Grace','Song title not inherited');
      await click('Classic lower third');await wait(80);assert(config().fontSize===classicFont&&config().backgroundColor===classicBackground,'Classic formatting was overwritten');await click('Designer · Title + Content');await wait(80);
      mounted.unmount();mounted=ReactDOM.createRoot(box);
      const queries=[];window.dualcast.fetchScripture=async({reference})=>{queries.push(reference);return{reference,text:'<span>For God so loved the world</span>',verses:[{reference,text:'&lt;b&gt;For God so loved the world&lt;/b&gt;'}]}};
      mounted.render(React.createElement(Scripture));await wait(120);
      assert(box.querySelector('[aria-label="Bible verse"]').options.length===36,'John 3 verse picker has wrong count');
      const before=config().programSlideId;input('Bible verse','16');input('Through verse','18');await wait(50);assert(config().programSlideId===before,'Selecting verses changed Program');await click('Show Live (Enter)');await until(()=>queries.at(-1)==='John 3:16-18'&&live()?.kind==='scripture','range live');
      assert(live().text==='For God so loved the world'&&!/[<>‹›]/.test(live().text),'Scripture markup reached Program');assert(lowerThirdTitle(live())==='John 3:16-18','Scripture reference not used as title');
      await click('Next Verse');await until(()=>queries.at(-1)==='John 3:19','next after range');
      await until(()=>box.querySelector('[aria-label="Jump to verse"]').value==='19'&&!box.querySelector('[aria-label="Jump to verse"]').disabled,'jump ready after next');input('Jump to verse','7');await wait(40);box.querySelector('[aria-label="Jump to verse"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',code:'Enter',keyCode:13,which:13,bubbles:true,cancelable:true}));await until(()=>queries.at(-1)==='John 3:7','keyboard jump');
      await until(()=>box.querySelector('[aria-label="Bible verse"]').value==='7'&&box.querySelector('[aria-label="Through verse"]').value==='7'&&!box.querySelector('[aria-label="Jump to verse"]').disabled,'jump resets single-verse selection');
      window.dualcast.getScriptureLibraryCatalog=async()=>({id:'test-offline',books:[{name:'John',chapters:[{number:3,verses:[1,3,7]}]}]});
      const lookups=[];window.dualcast.lookupScriptureLibrary=async({reference})=>{lookups.push(reference);return{reference,text:'Offline verse'}};
      await store.getState().updateSettings({scriptureSourceId:'test-offline'});await until(()=>box.querySelector('[aria-label="Bible verse"]').options.length===3,'offline sparse verses');
      input('Jump to verse','3');await wait(30);await click('Jump live');await until(()=>lookups.at(-1)==='John 3:3','offline jump');await click('Next Verse');await until(()=>lookups.at(-1)==='John 3:7'&&live()?.reference==='John 3:7','offline gap navigation');
      return {gallery:sheet.toDataURL(),programFrame,settings:config(),presets:6,sharedLogo:true,independentTextStyles:true,liveEditingWithoutNewCue:true,previewSafety:true,transparentOutput:true,animatedExit:true,classicPreserved:true,scripture:{range:true,keyboardJump:true,chapterCounts:true,sparseOffline:true,sanitized:true},responsive320px:true};
    }catch(error){throw Error(error.stack+'\\nControls: '+box.innerText.slice(0,2400));}finally{mounted.unmount();box.remove();}
  })()`, true);
  const fs = require('fs'), path = require('path'), assert = require('assert/strict');
  const directory = path.join(rootPath, 'tmp/designer-verification');fs.mkdirSync(directory,{recursive:true});
  fs.writeFileSync(path.join(directory,'styles.png'),Buffer.from(result.gallery.split(',')[1],'base64'));
  fs.writeFileSync(path.join(directory,'program.png'),Buffer.from(result.programFrame.split(',')[1],'base64'));
  const settings = require('../tmp/schedule-settings-verification.cjs');
  settings.updateSettings({lowerThird:result.settings});
  const normalized=settings.getSettings().lowerThird;
  assert.equal(normalized.mode,'designer');assert.equal(normalized.design.title.color,'#ffde00');assert.equal(normalized.design.content.color,'#00ff00');
  assert.ok(normalized.slides.some(slide=>slide.title==='PEACE AND PURPOSE'));
  delete result.gallery;delete result.programFrame;delete result.settings;
  return {...result,persisted:true};
};

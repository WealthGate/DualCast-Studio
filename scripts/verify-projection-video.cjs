// Exercise the production signaling router, preload and Projection component
// across two Electron renderers. Output windows stay hidden during this check.
module.exports = async function verifyProjectionVideo(primary, root) {
  const { BrowserWindow, ipcMain } = require('electron');
  const path = require('path');
  const fs = require('fs');
  const service = require(path.join(root, 'tmp/projection-verification.cjs'));
  fs.copyFileSync(path.join(root, 'dist-electron/preload.js'), path.join(root, 'tmp/preload.js'));
  process.env.VITE_DEV_SERVER_URL = 'http://127.0.0.1:5174';
  const send = primary.webContents.send;
  const show = BrowserWindow.prototype.show;
  const route = (event, signal) => service.routeProjectionSignal(event.sender, signal);
  const acknowledge = (event, sequence) => service.acknowledgeProjectionFrame(event.sender.id, sequence);
  const listener = event => {
    if (event.message.startsWith('PROJECTION_TEST_SIGNAL:')) service.routeProjectionSignal(primary.webContents, JSON.parse(event.message.slice(23)));
  };
  ipcMain.on('dualcast:projection-signal', route);
  ipcMain.on('dualcast:projection-frame-presented', acknowledge);
  ipcMain.handle('dualcast:get-program-state', () => service.getProgramState());
  primary.webContents.on('console-message', listener);
  primary.webContents.send = function(channel, signal) {
    if (channel === 'dualcast:projection-signal') {
      void primary.webContents.executeJavaScript(`window.__projectionTestSignal?.(${JSON.stringify(signal)})`).catch(() => {});
    } else send.call(this, channel, signal);
  };
  BrowserWindow.prototype.show = function() { if (this === primary) show.call(this); };
  let output;
  try {
    await primary.webContents.executeJavaScript(`(async()=>{
      const {store,wait}=window.__transitionCheck;
      window.__projectionTestRestore={send:window.dualcast.sendProjectionSignal,on:window.dualcast.onProjectionSignal,settings:store.getState().settings};
      window.dualcast.onProjectionSignal=handler=>{window.__projectionTestSignal=handler;return()=>{window.__projectionTestSignal=null;};};
      window.dualcast.sendProjectionSignal=signal=>console.log('PROJECTION_TEST_SIGNAL:'+JSON.stringify(signal));
      store.setState({settings:{...store.getState().settings,sanctuaryDisplay:{...store.getState().settings.sanctuaryDisplay,mode:'independent'}}});await wait(50);
      store.setState({settings:{...store.getState().settings,frameRate:30,networkOutput:{...store.getState().settings.networkOutput,enabled:false},sanctuaryDisplay:{...store.getState().settings.sanctuaryDisplay,mode:'program'}}});await wait(50);
    })()`);
    const state = { programSceneId: 'performance', isFrozen: false, isCutToBlack: false, qualityPreset: 'medium', frameRate: 30 };
    service.setProgramState(state);
    await service.openProjectionWindows(['projection-verification']);
    output = BrowserWindow.getAllWindows().find(window => window !== primary && window.webContents.getURL().includes('projection=program'));
    if (!output) throw Error('Production projection window was not created');
    const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
    const ready = () => output.webContents.executeJavaScript(`(()=>{const v=document.querySelector('.projection-video');return Boolean(v&&v.readyState>=2&&v.videoWidth&&getComputedStyle(v).visibility==='visible');})()`);
    for (let i=0;i<200 && !(await ready());i++) await wait(30);
    if (!(await ready())) throw Error('Production projection did not receive the live video stream');
    const dimensions = await output.webContents.executeJavaScript(`(()=>{const v=document.querySelector('.projection-video');return {width:v.videoWidth,height:v.videoHeight};})()`);
    service.setProgramState({...state,isCutToBlack:true}); await wait(80);
    if (await ready()) throw Error('Cut to black left sanctuary video visible');
    service.setProgramState(state); await wait(80);
    if (!(await ready())) throw Error('Restore did not reveal the sanctuary video');
    return { connected: true, dimensions, cutBlackRestore: true, productionPreloadAndRouter: true };
  } finally {
    await service.closeProjectionWindows();
    await primary.webContents.executeJavaScript(`(async()=>{const {store,wait}=window.__transitionCheck;const saved=window.__projectionTestRestore;if(!saved)return;store.setState({settings:{...store.getState().settings,sanctuaryDisplay:{...store.getState().settings.sanctuaryDisplay,mode:'independent'}}});await wait(50);window.dualcast.sendProjectionSignal=saved.send;window.dualcast.onProjectionSignal=saved.on;store.setState({settings:saved.settings});})()`).catch(() => {});
    BrowserWindow.prototype.show = show;
    primary.webContents.send = send;
    primary.webContents.removeListener('console-message', listener);
    ipcMain.removeListener('dualcast:projection-signal', route);
    ipcMain.removeListener('dualcast:projection-frame-presented', acknowledge);
    ipcMain.removeHandler('dualcast:get-program-state');
  }
};

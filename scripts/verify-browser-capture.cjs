module.exports = async function verifyBrowserCapture(root, observer) {
  const http = require('http');
  const path = require('path');
  const { BrowserWindow, nativeImage } = require('electron');
  const service = require(path.join(root, 'tmp/browser-verification.cjs'));
  let responseSent = false, earlyFrames = 0, firstFrame;
  const server = http.createServer((_request, response) => {
    setTimeout(() => {
      responseSent = true;
      response.writeHead(200, {'Content-Type':'text/html'});
      response.end('<body style="margin:0;height:100vh"><script>let n=0;function tick(){document.body.style.background=(n++%2)?"red":"blue";requestAnimationFrame(tick)}tick()</script>');
    }, 650);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const contents = observer.webContents;
  const send = contents.send;
  contents.send = function(channel, payload, ...args) {
    if (channel === 'dualcast:browser-frame' && payload.sourceId === 'browser-fps-check') {
      if (!responseSent) earlyFrames++;
      firstFrame ??= payload.dataUrl;
    }
    return send.call(this, channel, payload, ...args);
  };
  try {
    const url = 'http://127.0.0.1:' + server.address().port;
    const existingIds = new Set(BrowserWindow.getAllWindows().map(window => window.id));
    if (!await service.createBrowserSource({sourceId:'browser-fps-check',url,width:640,height:360,frameRate:30})) throw Error('Browser source did not load');
    const target = BrowserWindow.getAllWindows().find(window => !existingIds.has(window.id));
    if (!target) throw Error('Browser source window was not created');
    let frames = 0;
    target.webContents.on('paint', () => { frames++; });
    await new Promise(resolve => setTimeout(resolve, 2200));
    if (earlyFrames || !firstFrame) throw Error('Browser published before navigation or never published: '+earlyFrames);
    const bitmap = nativeImage.createFromDataURL(firstFrame).toBitmap();
    if (bitmap[0]+bitmap[2]<200) throw Error('The first browser frame was blank');
    if (frames < 35) throw Error('Browser capture is still near its old 10fps cap: ' + frames + ' frames in 2.2s');
    return {paintFrames:frames,seconds:2.2,requestedFps:30,usesRenderedFrames:true,earlyFrames};
  } finally {
    contents.send = send;
    await service.destroyBrowserSource({sourceId:'browser-fps-check'});
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
};

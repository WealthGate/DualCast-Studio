module.exports = async function verifyBrowserCapture(root) {
  const http = require('http');
  const path = require('path');
  const { BrowserWindow } = require('electron');
  const service = require(path.join(root, 'tmp/browser-verification.cjs'));
  const server = http.createServer((_request, response) => {
    response.writeHead(200, {'Content-Type':'text/html'});
    response.end('<body style="margin:0;height:100vh"><script>let n=0;function tick(){document.body.style.background=(n++%2)?"red":"blue";requestAnimationFrame(tick)}tick()</script>');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const url = 'http://127.0.0.1:' + server.address().port;
    const existingIds = new Set(BrowserWindow.getAllWindows().map(window => window.id));
    await service.createBrowserSource({sourceId:'browser-fps-check',url,width:640,height:360,frameRate:30});
    const target = BrowserWindow.getAllWindows().find(window => !existingIds.has(window.id));
    if (!target) throw Error('Browser source window was not created');
    let frames = 0;
    target.webContents.on('paint', () => { frames++; });
    await new Promise(resolve => setTimeout(resolve, 2200));
    if (frames < 35) throw Error('Browser capture is still near its old 10fps cap: ' + frames + ' frames in 2.2s');
    return {paintFrames:frames,seconds:2.2,requestedFps:30,usesRenderedFrames:true};
  } finally {
    await service.destroyBrowserSource({sourceId:'browser-fps-check'});
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
};

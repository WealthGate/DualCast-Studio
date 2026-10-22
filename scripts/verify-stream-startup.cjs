// Exercise the production service, timed pipe input and a real local RTMP
// receiver. No credentials or external broadcast services are used.
const fs = require('fs'), path = require('path'), net = require('net');
const { spawn, spawnSync } = require('child_process');
const root = path.resolve(__dirname, '..'), ffmpeg = require('ffmpeg-static');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const temp = path.join(root, 'tmp/stream-startup');
const ci = process.argv.includes('--ci');
const width = ci ? 1280 : 1920, height = ci ? 720 : 1080, fps = ci ? 30 : 60, seconds = ci ? 6 : 10;
fs.mkdirSync(temp, { recursive: true });

(async () => {
  await require('esbuild').build({ entryPoints: [path.join(root, 'electron/services/streamingService.ts')], bundle: true, platform: 'node', format: 'cjs', external: ['ffmpeg-static'], outfile: path.join(temp, 'service.cjs'), plugins: [{ name: 'isolated-desktop-host', setup(build) {
    build.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'test-host' }));
    build.onLoad({ filter: /.*/, namespace: 'test-host' }, () => ({ contents: `exports.app={getPath:()=>${JSON.stringify(temp)}};` }));
    build.onLoad({ filter: /[\\/]logger\.ts$/ }, () => ({ contents: 'export default {info(){},warn(){}};', loader: 'ts' }));
  } }] });
  const fixture = path.join(temp, `input-${width}-${fps}.mkv`);
  if (!fs.existsSync(fixture)) {
    const generated = spawnSync(ffmpeg, ['-hide_banner','-loglevel','error','-y','-f','lavfi','-i',`testsrc2=size=${width}x${height}:rate=${fps}`,'-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t',String(seconds),'-c:v','libx264','-preset','ultrafast','-threads','2','-crf','24','-g',String(fps*2),'-bf','0','-c:a','libopus','-f','matroska',fixture], { windowsHide: true, encoding: 'utf8' });
    if (generated.status !== 0) throw Error(generated.stderr);
  }
  const service = require(path.join(temp, 'service.cjs'));
  const encoder = process.argv.find(arg => arg.startsWith('--encoder='))?.split('=')[1] || 'qsv';
  if (!service.getStreamingCapabilities().encoders.includes(encoder)) throw Error('Requested encoder unavailable: '+encoder);
  const reservation = net.createServer(); await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  const endpoint = `rtmp://127.0.0.1:${port}/live/probe`;
  const received = path.join(temp, `${encoder}.flv`);
  const receiver = spawn(ffmpeg, ['-hide_banner','-y','-loglevel','error','-listen','1','-i',endpoint,'-map','0:v:0','-map','0:a:0?','-c','copy','-progress','pipe:1','-nostats','-f','flv',received], {windowsHide:true});
  let receivedFrames = 0, receiverError = '', source;
  receiver.stdout.on('data', data => { for(const match of data.toString().matchAll(/frame=\s*(\d+)/g)) receivedFrames=Number(match[1]); });
  receiver.stderr.on('data', data => {receiverError=(receiverError+data.toString()).slice(-2000);});
  const states = []; let firstLive = null, fatal = null;
  const began = Date.now();
  service.setStreamStatusPublisher(state => { states.push(state.status); if(state.status==='live') firstLive ??= Date.now()-began; if(state.status==='error') fatal=state.lastError||state.message; });
  try {
    await wait(300);
    const started = await service.startStreaming({destinations:[{id:'probe',name:'Local integration test',enabled:true,rtmpUrl:`rtmp://127.0.0.1:${port}/live`,streamKey:'probe'}],hasAudio:true,preset:'high',resolution:ci?'720p':'1080p',fps,audioBitrate:192,encoder});
    if(!started.ok)throw Error(started.message);
    source = spawn(ffmpeg, ['-hide_banner','-loglevel','error','-re','-i',fixture,'-c','copy','-cluster_time_limit','250','-flush_packets','1','-f','matroska','pipe:1'], {windowsHide:true});
    let pieces = [];
    const flush = () => { if(pieces.length){const chunk=Buffer.concat(pieces);pieces=[];void service.sendStreamChunk(new Uint8Array(chunk));} };
    const timer = setInterval(flush, 250);
    source.stderr.resume(); source.stdout.on('data', chunk => pieces.push(chunk));
    source.once('close', () => { clearInterval(timer); flush(); });
    const ended = new Promise(resolve => source.once('close', resolve));
    await Promise.race([ended, wait(14000)]); await wait(500);
    await service.stopStreaming(); await wait(1500);
    const decoded = spawnSync(ffmpeg,['-hide_banner','-i',received,'-an','-f','null','-','-progress','pipe:1'],{encoding:'utf8',windowsHide:true,timeout:15000});
    const count = [...(decoded.stdout||'').matchAll(/frame=\s*(\d+)/g)];
    receivedFrames = Number(count.at(-1)?.[1] || receivedFrames);
    const result = {encoder,width,height,fps,firstLiveMs:firstLive,receivedFrames,statuses:[...new Set(states)],error:fatal};
    console.log(JSON.stringify(result));
    if(fatal||!firstLive||decoded.status!==0||receivedFrames<fps*seconds*.8)throw Error('Real streaming startup/delivery failed: '+receiverError);
  } finally { service.forceStopStreaming(); source?.kill(); receiver.kill(); }
})().catch(error => { console.error(error.message); process.exitCode=1; });

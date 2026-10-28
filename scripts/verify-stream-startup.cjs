// Exercise the production service, timed pipe input and a real local RTMP
// receiver. No credentials or external broadcast services are used.
const fs = require('fs'), path = require('path'), net = require('net');
const { spawn, spawnSync } = require('child_process');
const { Transform } = require('stream');
const root = path.resolve(__dirname, '..'), ffmpeg = require('ffmpeg-static');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const temp = path.join(root, 'tmp/stream-startup');
const ci = process.argv.includes('--ci');
const width = ci ? 1280 : 1920, height = ci ? 720 : 1080;
const fps = Number(process.argv.find(arg => arg.startsWith('--fps='))?.split('=')[1]) || (ci ? 30 : 60);
const preset = process.argv.find(arg => arg.startsWith('--preset='))?.split('=')[1] || 'high';
const seconds = Number(process.argv.find(arg => arg.startsWith('--seconds='))?.split('=')[1]) || (ci ? 6 : 10);
const copyVideo = process.argv.includes('--copy-video');
const inputFile = process.argv.find(arg => arg.startsWith('--input='))?.slice(8);
const pauseOutputMs = Number(process.argv.find(arg => arg.startsWith('--pause-output-ms='))?.split('=')[1]) || 0;
const uploadKbps = Number(process.argv.find(arg => arg.startsWith('--upload-kbps='))?.split('=')[1]) || 0;
const expectCongestion = process.argv.includes('--expect-congestion');
fs.mkdirSync(temp, { recursive: true });
let service, source, receiver, proxy;
const sockets = new Set(), proxyTimers = new Set();
const cleanup = () => { service?.forceStopStreaming(); source?.kill('SIGKILL'); receiver?.kill('SIGKILL'); proxy?.close(); sockets.forEach(socket=>socket.destroy());proxyTimers.forEach(clearTimeout); };
const watchdog = setTimeout(() => { console.error('Local RTMP integration test exceeded its bounded duration.'); cleanup(); process.exit(1); }, Math.max(90000,(seconds+45)*1000));

(async () => {
  await require('esbuild').build({ entryPoints: [path.join(root, 'electron/services/streamingService.ts')], bundle: true, platform: 'node', format: 'cjs', external: ['ffmpeg-static'], outfile: path.join(temp, 'service.cjs'), plugins: [{ name: 'isolated-desktop-host', setup(build) {
    build.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'test-host' }));
    build.onLoad({ filter: /.*/, namespace: 'test-host' }, () => ({ contents: `exports.app={getPath:()=>${JSON.stringify(temp)}};` }));
    build.onLoad({ filter: /[\\/]logger\.ts$/ }, () => ({ contents: 'export default {info(){},warn(){}};', loader: 'ts' }));
  } }] });
  console.log('Streaming integration: production service bundled.');
  const fixture = inputFile ? path.resolve(inputFile) : path.join(temp, `input-${width}-${fps}-${seconds}.mkv`);
  if (!fs.existsSync(fixture)) {
    const generated = spawnSync(ffmpeg, ['-hide_banner','-loglevel','error','-y','-f','lavfi','-i',`testsrc2=size=${width}x${height}:rate=${fps}`,'-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t',String(seconds),'-c:v','libx264','-preset','ultrafast','-threads','2','-crf','24','-g',String(fps*2),'-bf','0','-c:a','libopus','-f','matroska',fixture], { windowsHide: true, encoding: 'utf8', timeout: 60000 });
    if (generated.status !== 0) throw Error(generated.stderr);
  }
  console.log('Streaming integration: moving-video fixture ready.');
  service = require(path.join(temp, 'service.cjs'));
  console.log('Streaming integration: encoder detection completed.');
  const encoder = process.argv.find(arg => arg.startsWith('--encoder='))?.split('=')[1] || 'qsv';
  if (!service.getStreamingCapabilities().encoders.includes(encoder)) throw Error('Requested encoder unavailable: '+encoder);
  const reservation = net.createServer(); await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
  const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
  const endpoint = `rtmp://127.0.0.1:${port}/live/probe`;
  let publishPort = port, uploadedBytes = 0;
  if(pauseOutputMs || uploadKbps){
    proxy=net.createServer(client=>{
      const upstream=net.connect(port,'127.0.0.1');sockets.add(client);sockets.add(upstream);
      client.on('error',()=>upstream.destroy());upstream.on('error',()=>client.destroy());
      if(uploadKbps){
        // Pace every byte delivered to ingest; a paused socket alone can let
        // OS TCP buffers absorb the whole test and never pressure the sender.
        let sendAt=Date.now();
        const limiter=new Transform({transform(chunk,_encoding,done){
          let offset=0;
          const sliceBytes=Math.max(256,Math.min(65536,Math.floor(uploadKbps*1000/8/20)));
          const next=()=>{
            if(client.destroyed||upstream.destroyed){done();return;}
            const piece=chunk.subarray(offset,Math.min(chunk.length,offset+sliceBytes));offset+=piece.length;
            this.push(piece);uploadedBytes+=piece.length;
            // Carry timer overshoot into the next deadline. On Windows,
            // sleeping for each tiny TCP chunk can otherwise turn 4.5 Mb/s
            // into well below 1 Mb/s despite the configured test capacity.
            sendAt=Math.max(sendAt,Date.now()-50)+piece.length*8/uploadKbps;
            const delay=sendAt-Date.now();
            if(delay<=1){if(offset<chunk.length)next();else done();return;}
            const timer=setTimeout(()=>{proxyTimers.delete(timer);if(offset<chunk.length)next();else done();},delay);
            proxyTimers.add(timer);
          };next();
        }});
        limiter.on('error',()=>client.destroy());client.pipe(limiter).pipe(upstream);
      }else client.pipe(upstream);
      upstream.pipe(client);
      if(pauseOutputMs)proxyTimers.add(setTimeout(()=>{client.pause();proxyTimers.add(setTimeout(()=>client.resume(),pauseOutputMs));},3500));
    });
    await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));publishPort=proxy.address().port;
  }
  const received = path.join(temp, `${encoder}-${process.pid}.flv`);
  receiver = spawn(ffmpeg, ['-hide_banner','-y','-loglevel','error','-listen','1','-i',endpoint,'-map','0:v:0','-map','0:a:0?','-c','copy','-progress','pipe:1','-nostats','-f','flv',received], {windowsHide:true});
  let receivedFrames = 0, receiverError = '';
  receiver.stdout.on('data', data => { for(const match of data.toString().matchAll(/frame=\s*(\d+)/g)) receivedFrames=Number(match[1]); });
  receiver.stderr.on('data', data => {receiverError=(receiverError+data.toString()).slice(-2000);});
  const states = []; let firstLive = null, fatal = null, congestion = null;
  let reportCongestion;
  const congested = new Promise(resolve => { reportCongestion=resolve; });
  const began = Date.now();
  service.setStreamStatusPublisher(state => { states.push(state.status); if(state.status==='live') firstLive ??= Date.now()-began; if(state.status==='error') fatal=state.lastError||state.message; if(state.restartRequired&&state.reduceLoad){congestion ??= Date.now()-began;reportCongestion();} });
  try {
    await wait(1000);
    const started = await service.startStreaming({destinations:[{id:'probe',name:'Local integration test',enabled:true,rtmpUrl:`rtmp://127.0.0.1:${publishPort}/live`,streamKey:'probe'}],hasAudio:true,preset,resolution:ci?'720p':'1080p',fps,audioBitrate:192,encoder,copyVideo,inputVideoCodec:'h264',autoRecover:expectCongestion});
    if(!started.ok)throw Error(started.message);
    console.log('Streaming integration: local RTMP output started.');
    source = spawn(ffmpeg, ['-hide_banner','-loglevel','error','-re','-i',fixture,'-c','copy','-cluster_time_limit','250','-flush_packets','1','-f','matroska','pipe:1'], {windowsHide:true});
    let pieces = [];
    const flush = () => { if(pieces.length){const chunk=Buffer.concat(pieces);pieces=[];void service.sendStreamChunk(new Uint8Array(chunk));} };
    const timer = setInterval(flush, 250);
    source.stderr.resume(); source.stdout.on('data', chunk => pieces.push(chunk));
    source.once('close', () => { clearInterval(timer); flush(); });
    const ended = new Promise(resolve => source.once('close', resolve));
    if(expectCongestion){
      await Promise.race([congested,ended,wait(Math.min(seconds+4,40)*1000)]);
      source.kill('SIGKILL');await wait(300);
      const transportLog=fs.readFileSync(service.getStreamLogPath(),'utf8');
      if(!congestion||fatal||congestion>40000||uploadedBytes<16000)throw Error('Insufficient upload did not request a bounded lower-bandwidth recovery over a working local transport. '+JSON.stringify({seconds,uploadKbps,uploadedBytes,congestionRecoveryMs:congestion,firstLiveMs:firstLive,error:fatal,statuses:[...new Set(states)]}));
      if(/FIFO queue full|queue overflow|FIFO queue flushed/i.test(transportLog))throw Error('Congestion discarded packets before adapting.');
      console.log(JSON.stringify({encoder,copyVideo,uploadKbps,uploadedBytes,congestionRecoveryMs:congestion,lowerBandwidthRequested:true,discardedPackets:false,statuses:[...new Set(states)],error:fatal}));
      return;
    }
    const sourceCode = await Promise.race([ended, wait((seconds+4)*1000).then(()=>-1)]);
    if(sourceCode!==0)throw Error('Timed source failed or exceeded its deadline: '+sourceCode);
    await wait(500);
    console.log('Streaming integration: timed source finished.');
    await service.stopStreaming(); await wait(1500);
    const decoded = spawnSync(ffmpeg,['-hide_banner','-i',received,'-vf','showinfo','-af','ashowinfo','-f','null','-','-progress','pipe:1'],{encoding:'utf8',windowsHide:true,timeout:15000,maxBuffer:16*1024*1024});
    const transportLog = fs.readFileSync(service.getStreamLogPath(),'utf8');
    if(/Non-monoton(?:ic|ous).*DTS/i.test(transportLog))throw Error('Output timestamps moved backwards or collided.');
    if(/FIFO queue full|queue overflow/i.test(transportLog))throw Error('Output discarded media during the transport test.');
    const count = [...(decoded.stdout||'').matchAll(/frame=\s*(\d+)/g)];
    receivedFrames = Number(count.at(-1)?.[1] || receivedFrames);
    const videoTimes=[...(decoded.stderr||'').matchAll(/Parsed_showinfo[^\n]*pts_time:([0-9.]+)/g)].map(m=>Number(m[1]));
    const audioTimes=[...(decoded.stderr||'').matchAll(/Parsed_ashowinfo[^\n]*pts_time:([0-9.]+)/g)].map(m=>Number(m[1]));
    const avDriftMs=Math.round(Math.abs(videoTimes.at(-1)-audioTimes.at(-1))*1000);
    const maxAudioGapMs=Math.round(Math.max(...audioTimes.slice(1).map((time,i)=>time-audioTimes[i]))*1000);
    const result = {encoder,copyVideo,preset,pauseOutputMs,uploadKbps,uploadedBytes,width,height,fps,seconds,firstLiveMs:firstLive,receivedFrames,audioFrames:audioTimes.length,avDriftMs,maxAudioGapMs,statuses:[...new Set(states)],error:fatal};
    console.log(JSON.stringify(result));
    const requiredFrames=inputFile?fps*seconds*.8:fps*seconds-2;
    if(fatal||!firstLive||decoded.status!==0||receivedFrames<requiredFrames||!audioTimes.length||avDriftMs>250||maxAudioGapMs>100)throw Error('Real streaming startup/delivery failed: '+receiverError);
  } finally { cleanup(); }
})().catch(error => { console.error(error.message); cleanup(); process.exitCode=1; }).finally(() => clearTimeout(watchdog));

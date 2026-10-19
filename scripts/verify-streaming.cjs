const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const ffmpeg = require('ffmpeg-static');
fs.mkdirSync('tmp', { recursive: true });
function run(args) {
  const result = spawnSync(ffmpeg, ['-hide_banner', '-y', ...args], { encoding: 'utf8', timeout: 120000, windowsHide: true });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr);
  return result;
}
run(['-f','lavfi','-i','testsrc2=size=1280x720:rate=30','-f','lavfi','-i','sine=frequency=440:sample_rate=48000','-t','12','-c:v','libvpx','-deadline','realtime','-cpu-used','8','-b:v','2500k','-g','60','-c:a','libopus','tmp/stream-audit.webm']);
const results = {};
for (const flag of ['nobuffer', 'genpts']) {
  const result = run(['-fflags',flag,'-i','tmp/stream-audit.webm','-map','0:v:0','-an','-progress','pipe:1','-nostats','-f','null','-']);
  const frames = [...result.stdout.matchAll(/^frame=(\d+)/gm)];
  results[flag] = { frames: Number(frames.at(-1)?.[1]), decoderErrors: (result.stderr.match(/Error submitting|Discarding interframe/g) || []).length };
}
const result = run(['-re','-fflags','genpts','-i','tmp/stream-audit.webm','-map','0:v:0','-map','0:a:0?','-r','30','-c:v','libx264','-preset','veryfast','-tune','zerolatency','-b:v','2500k','-maxrate','2500k','-minrate','2500k','-bufsize','5000k','-x264-params','nal-hrd=cbr:force-cfr=1','-pix_fmt','yuv420p','-g','60','-keyint_min','60','-sc_threshold','0','-c:a','aac','-b:a','128k','-ar','48000','-progress','pipe:1','-nostats','-f','tee','-use_fifo','1','-fifo_options','queue_size=120:drop_pkts_on_overflow=1:attempt_recovery=1:recover_any_error=1:recovery_wait_time=1:restart_with_keyframe=1','[f=flv:onfail=abort]tmp/stream-audit.flv']);
const frames = [...result.stdout.matchAll(/^frame=(\d+)/gm)];
const speeds = [...result.stdout.matchAll(/^speed=\s*([\d.]+)x/gm)];
results.realtime = { frames: Number(frames.at(-1)?.[1]), speed: Number(speeds.at(-1)?.[1]), decoderErrors: (result.stderr.match(/Error submitting|Discarding interframe/g) || []).length };
if (results.genpts.frames !== 360 || results.realtime.frames !== 360 || results.realtime.decoderErrors) throw new Error(JSON.stringify(results));
fs.writeFileSync('tmp/streaming-audit-results.json', JSON.stringify(results, null, 2));
console.log(JSON.stringify(results));

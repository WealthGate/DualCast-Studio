module.exports = async function browserStreamFixture() {
  const { createStreamingCapture } = await import('/utils/streamingCapture.ts');
  const { publishCanvasFrame } = await import('/utils/canvasFrames.ts');
  const canvas = document.createElement('canvas'); canvas.width = 640; canvas.height = 360;
  const context = canvas.getContext('2d');
  const capture = createStreamingCapture(canvas, 'medium', 60, '720p');
  const audio = new AudioContext(), oscillator = audio.createOscillator(), destination = audio.createMediaStreamDestination();
  oscillator.connect(destination); oscillator.start(); await audio.resume();
  const stream = new MediaStream([...capture.stream.getVideoTracks(), ...destination.stream.getAudioTracks()]);
  const recorder = new MediaRecorder(stream, { mimeType: 'video/webm;codecs=h264,opus', videoBitsPerSecond: 1500000, videoKeyFrameIntervalDuration: 2000 });
  const chunks = []; recorder.ondataavailable = event => { if(event.data.size) chunks.push(event.data); };
  let frame = 0;
  const timer = setInterval(() => { context.fillStyle = `rgb(${frame++%255},50,100)`; context.fillRect(0,0,640,360); publishCanvasFrame(canvas, performance.now()); }, 4);
  try {
    recorder.start(250); await new Promise(resolve => setTimeout(resolve, 6000));
    await new Promise(resolve => { recorder.onstop = resolve; recorder.stop(); });
    const blob = new Blob(chunks, { type: recorder.mimeType });
    return await new Promise(resolve => { const reader = new FileReader(); reader.onload = () => resolve(reader.result.slice(reader.result.lastIndexOf(',')+1)); reader.readAsDataURL(blob); });
  } finally { clearInterval(timer); capture.stop(); stream.getTracks().forEach(track => track.stop()); oscillator.stop(); await audio.close(); }
};

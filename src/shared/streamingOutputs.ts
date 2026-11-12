export const escapeTeeOutputUrl = (value: string) => value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");

export const buildRecoverableRtmpOutputArgs = (endpoint: string, fps = 30) => [
  "-f",
  "tee",
  "-use_fifo",
  "1",
  "-fifo_options",
  // A bounded queue absorbs a short transport pause. If the uplink remains
  // slower than the media rate, propagate backpressure to the input monitor;
  // dropping packets here flushes both sound and dependent video frames and
  // repeatedly breaks playback without telling the producer to use less data.
  `queue_size=${Math.ceil((fps + 50) * 6)}:drop_pkts_on_overflow=0:attempt_recovery=1:recover_any_error=0:max_recovery_attempts=5:recovery_wait_time=1:restart_with_keyframe=1`,
  `[f=flv:onfail=abort:rw_timeout=5000000:flvflags=no_duration_filesize]${escapeTeeOutputUrl(endpoint)}`
];

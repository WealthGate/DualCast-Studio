export const escapeTeeOutputUrl = (value: string) => value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");

export const buildRecoverableRtmpOutputArgs = (endpoint: string, fps = 30) => [
  "-f",
  "tee",
  "-use_fifo",
  "1",
  "-fifo_options",
  // Cover the five-second network write deadline plus one media batch. A
  // two-second queue discarded audio/video during recoverable short stalls.
  `queue_size=${Math.ceil((fps + 50) * 6)}:drop_pkts_on_overflow=1:attempt_recovery=1:recover_any_error=0:max_recovery_attempts=5:recovery_wait_time=1:restart_with_keyframe=1`,
  `[f=flv:onfail=abort:rw_timeout=5000000:flvflags=no_duration_filesize]${escapeTeeOutputUrl(endpoint)}`
];

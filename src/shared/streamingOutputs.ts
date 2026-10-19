export const escapeTeeOutputUrl = (value: string) => value.replace(/\\/g, "\\\\").replace(/\|/g, "\\|");

export const buildRecoverableRtmpOutputArgs = (endpoint: string) => [
  "-f",
  "tee",
  "-use_fifo",
  "1",
  "-fifo_options",
  "queue_size=120:drop_pkts_on_overflow=1:attempt_recovery=1:recover_any_error=1:recovery_wait_time=1:restart_with_keyframe=1",
  `[f=flv:onfail=abort]${escapeTeeOutputUrl(endpoint)}`
];

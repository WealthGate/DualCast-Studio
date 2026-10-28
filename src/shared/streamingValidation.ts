export const isValidRtmpUrl = (rtmpUrl: string) => {
  try {
    const parsed = new URL(rtmpUrl);
    return parsed.protocol === "rtmp:" || parsed.protocol === "rtmps:";
  } catch {
    return false;
  }
};

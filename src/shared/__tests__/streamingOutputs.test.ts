import { describe, expect, it } from "vitest";
import { buildRecoverableRtmpOutputArgs, escapeTeeOutputUrl } from "../streamingOutputs";

describe("recoverable streaming outputs", () => {
  it("enables FIFO recovery without respawning the input decoder", () => {
    const args = buildRecoverableRtmpOutputArgs("rtmps://example.test/live/key");
    expect(args).toContain("tee");
    const options = args[args.indexOf("-fifo_options") + 1];
    expect(options).toContain("attempt_recovery=1");
    expect(options).toContain("drop_pkts_on_overflow=0");
    expect(options).toContain("queue_size=480");
    expect(options).toContain("max_recovery_attempts=5");
    expect(options).toContain("recover_any_error=0");
    expect(options).toContain("restart_with_keyframe=1");
    expect(args.at(-1)).toContain("rw_timeout=5000000");
  });

  it("accounts for both audio and video packets when bounding 60fps recovery", () => {
    expect(buildRecoverableRtmpOutputArgs("rtmp://host/live/key", 60)).toEqual(expect.arrayContaining([expect.stringContaining("queue_size=660:")]));
  });

  it("escapes tee output separators in an endpoint", () => {
    expect(escapeTeeOutputUrl("rtmp://host/live/a|b")).toBe("rtmp://host/live/a\\|b");
  });
});

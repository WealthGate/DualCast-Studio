import { describe, expect, it } from "vitest";
import { buildRecoverableRtmpOutputArgs, escapeTeeOutputUrl } from "../streamingOutputs";

describe("recoverable streaming outputs", () => {
  it("enables FIFO recovery without respawning the input decoder", () => {
    const args = buildRecoverableRtmpOutputArgs("rtmps://example.test/live/key");
    expect(args).toContain("tee");
    expect(args).toContain("attempt_recovery=1:recover_any_error=1:recovery_wait_time=2:restart_with_keyframe=1");
  });

  it("escapes tee output separators in an endpoint", () => {
    expect(escapeTeeOutputUrl("rtmp://host/live/a|b")).toBe("rtmp://host/live/a\\|b");
  });
});

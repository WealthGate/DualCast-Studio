import { describe, expect, it, vi } from "vitest";
import { applyProjectionSignal, localProjectionDescription } from "../projectionPeer";
describe("local projection signaling", () => {
  it("sets local video startup bitrate without changing audio or codec profiles", () => {
    const description = localProjectionDescription({ type: "offer", sdp: "a=rtpmap:96 VP8/90000\r\na=rtpmap:97 H264/90000\r\na=fmtp:97 profile-level-id=42e01f\r\na=rtpmap:111 opus/48000/2\r\na=fmtp:111 useinbandfec=1\r\n" });
    expect(description.sdp).toContain("a=fmtp:96 x-google-start-bitrate=8000");
    expect(description.sdp).toContain("a=fmtp:97 profile-level-id=42e01f;x-google-start-bitrate=8000");
    expect(description.sdp).toContain("a=fmtp:111 useinbandfec=1\r\n");
  });
  it("retains early ICE candidates until the remote description is installed", async () => {
    const candidate = { candidate: "candidate:local" };
    const peer = { remoteDescription: null as unknown, addIceCandidate: vi.fn(async () => {}), setRemoteDescription: vi.fn(async (description: unknown) => { peer.remoteDescription = description; }) };
    await applyProjectionSignal(peer as unknown as RTCPeerConnection, { type: "candidate", candidate });
    expect(peer.addIceCandidate).not.toHaveBeenCalled();
    await applyProjectionSignal(peer as unknown as RTCPeerConnection, { type: "answer", description: { type: "answer", sdp: "local" } });
    expect(peer.addIceCandidate).toHaveBeenCalledWith(candidate);
    await applyProjectionSignal(peer as unknown as RTCPeerConnection, { type: "candidate", candidate });
    expect(peer.addIceCandidate).toHaveBeenCalledTimes(2);
  });
});

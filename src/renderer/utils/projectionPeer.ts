import type { ProjectionSignal } from "../../shared/types";
const candidates = new WeakMap<RTCPeerConnection, RTCIceCandidateInit[]>();
// These peers are on the same PC. Avoid the Internet-call startup estimate
// shrinking sanctuary video while congestion control slowly ramps up.
export const localProjectionDescription = (description: RTCSessionDescriptionInit): RTCSessionDescriptionInit => {
  if (!description.sdp) return description;
  const lines = description.sdp.split(/\r?\n/);
  const ids = lines.flatMap(line => /^a=rtpmap:(\d+) (?:VP8|VP9|H264|AV1)\//i.exec(line)?.[1] ?? []);
  for (const id of ids) {
    const index = lines.findIndex(line => line.startsWith(`a=fmtp:${id} `));
    const options = "x-google-start-bitrate=8000;x-google-min-bitrate=2500;x-google-max-bitrate=20000";
    if (index >= 0) lines[index] += `;${options}`;
    else lines.splice(lines.findIndex(line => line.startsWith(`a=rtpmap:${id} `)) + 1, 0, `a=fmtp:${id} ${options}`);
  }
  return { ...description, sdp: lines.join("\r\n") };
};
export const applyProjectionSignal = async (peer: RTCPeerConnection, signal: ProjectionSignal) => {
  if (signal.candidate) {
    if (peer.remoteDescription) await peer.addIceCandidate(signal.candidate);
    else { const pending = candidates.get(peer) ?? []; pending.push(signal.candidate); candidates.set(peer, pending); }
  }
  if (signal.description) {
    await peer.setRemoteDescription(signal.description);
    const pending = candidates.get(peer) ?? []; candidates.delete(peer);
    for (const candidate of pending) await peer.addIceCandidate(candidate);
  }
};

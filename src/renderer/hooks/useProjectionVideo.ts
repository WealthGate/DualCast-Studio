import { RefObject, useEffect, useState } from "react";
import { createStreamingCapture } from "../utils/streamingCapture";
import { applyProjectionSignal, localProjectionDescription } from "../utils/projectionPeer";

// Local WebRTC keeps video on Chromium's media path instead of JPEG encoding,
// base64 IPC and image decoding for every frame on every sanctuary display.
export const useProjectionVideo = (canvasRef: RefObject<HTMLCanvasElement>, fps: number, enabled: boolean) => {
  const [allConnected, setAllConnected] = useState(false);
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !enabled) { setAllConnected(false); return; }
    setAllConnected(false);
    let active = true;
    let stream: MediaStream | null = null;
    let stopCapture: (() => void) | null = null;
    const peers = new Map<number, RTCPeerConnection>();
    const connectionTimers = new Map<number, number>();
    const update = () => {
      peers.forEach((peer, id) => { if (peer.connectionState === "connected") { window.clearTimeout(connectionTimers.get(id)); connectionTimers.delete(id); } });
      if (active) setAllConnected(peers.size > 0 && Array.from(peers.values()).every(peer => peer.connectionState === "connected"));
    };
    const release = (id: number) => {
      window.clearTimeout(connectionTimers.get(id)); connectionTimers.delete(id);
      peers.get(id)?.close(); peers.delete(id);
      if (!peers.size) { stopCapture?.(); stopCapture = null; stream = null; }
      update();
    };
    const unsubscribe = window.dualcast.onProjectionSignal(signal => {
      const id = signal.peerId;
      if (!id) return;
      if (signal.type === "closed") { release(id); return; }
      if (signal.type === "ready") {
        release(id);
        if (!stream) {
          // Capture at the delivery resolution BEFORE Chromium's video encoder.
          // Feeding a 1440p/60 Program track to a software encoder overloads
          // frame conversion even after WebRTC's congestion controller scales it.
          const capture = createStreamingCapture(canvas, "low", fps);
          stream = capture.stream;
          stopCapture = capture.stop;
          const track = stream.getVideoTracks()[0] as CanvasCaptureMediaStreamTrack;
          track.contentHint = "motion";
        }
        let peer: RTCPeerConnection;
        try { peer = new RTCPeerConnection({ iceServers: [] }); }
        catch { release(id); return; }
        peers.set(id, peer); update();
        connectionTimers.set(id, window.setTimeout(() => { if (peers.get(id) === peer && peer.connectionState !== "connected") release(id); }, 5000));
        stream.getTracks().forEach(track => peer.addTrack(track, stream!));
        const codecs = RTCRtpSender.getCapabilities("video")?.codecs ?? [];
        const h264 = codecs.filter(codec => codec.mimeType.toLowerCase() === "video/h264");
        if (h264.length) peer.getTransceivers()[0]?.setCodecPreferences([...h264, ...codecs.filter(codec => codec.mimeType.toLowerCase() !== "video/h264")]);
        peer.onicecandidate = event => { if (event.candidate) window.dualcast.sendProjectionSignal({ type: "candidate", peerId: id, candidate: event.candidate.toJSON() }); };
        peer.onconnectionstatechange = () => { if (peer.connectionState === "failed") release(id); else update(); };
        void (async () => {
          const sender = peer.getSenders()[0], parameters = sender.getParameters();
          parameters.degradationPreference = "maintain-framerate";
          if (parameters.encodings?.length) { parameters.encodings[0].maxBitrate = 20_000_000; parameters.encodings[0].maxFramerate = fps; await sender.setParameters(parameters); }
          await peer.setLocalDescription(localProjectionDescription(await peer.createOffer()));
          if (active && peers.get(id) === peer) window.dualcast.sendProjectionSignal({ type: "offer", peerId: id, description: peer.localDescription!.toJSON() });
        })().catch(() => { if (peers.get(id) === peer) release(id); });
      } else {
        const peer = peers.get(id); if (!peer) return;
        if (signal.type === "answer" || signal.type === "candidate") void applyProjectionSignal(peer, signal).then(async () => {
          if (signal.type !== "answer" || peers.get(id) !== peer) return;
          const sender = peer.getSenders()[0], parameters = sender.getParameters();
          parameters.degradationPreference = "maintain-framerate";
          if (parameters.encodings?.length) {
            parameters.encodings[0].maxFramerate = fps;
            parameters.encodings[0].maxBitrate = 20_000_000;
            await sender.setParameters(parameters);
          }
        }).catch(() => { if (peers.get(id) === peer) release(id); });
      }
    });
    window.dualcast.sendProjectionSignal({ type: "register" });
    return () => { active = false; unsubscribe(); stopCapture?.(); connectionTimers.forEach(timer => window.clearTimeout(timer)); peers.forEach(peer => peer.close()); };
  }, [canvasRef, fps, enabled]);
  return allConnected;
};

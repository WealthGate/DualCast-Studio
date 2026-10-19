# Streaming stability audit — 19 October 2026

Reviewed the Program renderer, source capture, browser sources, audio mixing, projection and lower-third frame delivery, recorder, streaming IPC, FFmpeg input/encoding, destination recovery, shutdown, YouTube broadcast setup, and release workflow. Findings below concern the live-streaming path; this is not a claim that every application behavior or every viewer/network combination was tested.

## Confirmed findings

- Recent local streaming logs showed a 2560×1440 VP8 input despite a 1080p output, 19–24 encoded frames per second for a 30 fps stream, and average processing speeds of 0.64×–0.81× real time. Excess browser encoding and FFmpeg decoding work can starve output.
- FFmpeg's `nobuffer` input option discarded initial packets needed to decode the WebM stream. Logs reported interframes without a prior keyframe.
- Renderer delivery serialized chunks without a backlog limit. A slow FFmpeg input could accumulate latency and memory indefinitely.
- Destination FIFO recovery used its default blocking queue behavior. A blocked network writer could propagate backpressure into capture and other destinations.
- Lower-third frames used synchronous full-size image encoding on the renderer thread.
- The studio did not expose the encoder's real-time speed, obscuring sustained underperformance.

## Changes

- Capture a dedicated stream canvas capped at 1280×720 or 1920×1080, preserving aspect ratio and the requested stream FPS before VP8 encoding. Program and recording resolution remain independent.
- Deliver recorder data every 250 ms instead of one second. Preserve chunk order; never drop arbitrary dependent WebM input chunks.
- Retain initial input packets with `genpts`; retain two-second output keyframes, add explicit x264 CBR settings, and use 48 kHz AAC output.
- Bound destination recovery queues, discard stale encoded output on overflow, and resume on a keyframe. This limits latency during network disruption; it cannot create missing upload capacity.
- Time out stalled encoder writes after five seconds. Bound renderer delivery to 32 pending chunks or 16 MiB and stop with an actionable error if overloaded.
- Encode lower-third projection frames asynchronously with at most one image encoding in flight.
- Show sustained sub-real-time delivery and network queue overflow warnings.
- Add a native FFmpeg smoke test to every platform's release checks.

## Verification

`npm test` covers capture sizing/cadence/cleanup, encoder options, network recovery configuration, stalled writes, shutdown, and old process isolation, alongside the rest of the application suite.

`npm run verify:streaming` generates a synthetic 12-second 720p30 WebM clip with audio and tests the bundled FFmpeg. On this computer, the previous `nobuffer` input decoded 300/360 frames and logged 107 decoder errors. The corrected input decoded 360/360 frames with no decoder errors. A paced H.264/AAC FIFO-to-FLV encode delivered 360/360 frames with no decoder errors at approximately 1.04× real time. This is a local transport/encoding smoke test; it does not exercise a public RTMP server, real network congestion, or YouTube viewer playback.

The user's actual YouTube broadcast still needs an end-to-end check after installation. Sustained upload capacity, simultaneous destinations, machine load, YouTube ingest health, and viewer connectivity can still cause buffering. The changes correct identified application bottlenecks and expose overload rather than guaranteeing uninterrupted playback under every condition.

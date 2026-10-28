# Streaming stability audit — through 23 October 2026

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

## v0.6.29: connecting then halting during Quick Sync startup

The supplied `streaming-2026-10-22T14-13-55-659Z.log` selects `h264_qsv`, recognizes 1920×1080 H.264 plus Opus audio, creates the RTMPS output, reports `frame=0`, and then reports the app's encoder-input stall timeout. Other logs from the same session show the same pattern. This log contains no authentication rejection and does not establish a bad stream key or insufficient upload bandwidth.

The production service reproduced the failure against a local RTMP receiver, without Internet access or service credentials. The previous 1.5-second write deadline and live queue limits applied during cold encoder initialization. Treating the first nonzero frame as steady output also tightened those limits before the pipeline had caught up; a first frame alone did not establish sustained delivery. The initial reproduction delivered zero frames, and an intermediate first-frame-only correction still failed after a few frames.

Corrections:

- Allow at most ten seconds of startup, 48 pending input batches, and a bounded startup byte budget. Declare startup complete after one second's worth of video frames has been encoded. Keep the existing eight-batch/1.5-second live limits once streaming is sustained. Writes adapt to the transition, and older startup packets receive their live-age origin at that transition; queued codec-dependent data is never arbitrarily discarded into a running decoder.
- Bound decoder threads to two and filter threads to one. Configure Quick Sync with NV12, `async_depth=1`, `look_ahead=0`, and the veryfast preset. Disable B-frames and add explicit global codec headers for tee/FIFO output. These settings use the documented [QSV encoder options](https://ffmpeg.org/ffmpeg-codecs.html) and [tee muxer header requirements](https://ffmpeg.org/ffmpeg-formats.html#tee).
- Parse both carriage-return and newline progress records, including multiple progress lines delivered in one chunk.
- Cancel pending startup writes on stop, clear startup timers on shutdown, and preserve failure status/log details after the renderer's automatic cleanup. Starting a new session clears the previous error.
- Surface browser MediaRecorder failures, preserve local capture/delivery errors across backend cleanup, stop the backend on unexpected capture termination, and honor cancellation during start.

Validation: 204 unit tests and production type-check/build pass. The real production service encoded a paced Full-HD/60 H.264+Opus source through Quick Sync into a local RTMP receiver; the received FLV decoded all **600 frames**, with sustained-live status at **2.27 seconds** and no app-side error. The software configuration delivered all **180 frames at 720p/30**, with sustained-live status at **1.63 seconds**. Renderer checks using the actual streaming hook and MediaRecorder verify that capture errors remain visible, retry clears them, and unexpected capture stops clean up the backend.

`npm run verify:stream-startup` now tests the production service, timed input and real local RTMP receiver in every desktop release job, alongside the existing transport checks. `node scripts/verify-stream-startup.cjs --encoder=qsv` runs the heavier Full-HD/60 hardware check on a machine where Quick Sync is detected. These are controlled local tests; an unlisted YouTube test after updating is still needed to validate the user's actual ingest connection and viewers. A conservative temporary configuration is Software x264, 720p, 30 fps.

## v0.6.30: steady-state queue shutdown and excessive streaming work

The supplied `streaming-2026-10-22T15-11-07-655Z.log` starts successfully, then stops after approximately 27 seconds. It uses software x264 at 1280×720/30 but retains a 6500 kbps video target, unnecessarily decodes/re-encodes H.264 browser video, accumulates duplicated frames, falls below real-time speed, and reaches the app's bounded input-queue limit. One initial FIFO overflow also leaves an ongoing upload warning. The log does not establish a sustained network-capacity problem or an authentication rejection. Window capture was confirmed working after the user installed v0.6.29; no window-capture code changes are included here.

Corrections:

- Reuse H.264 video when the browser capture already supplies it at the requested stream dimensions/rate. Audio is converted to AAC. Other video formats retain the selected FFmpeg encoder; operators can disable H.264 reuse in Stream Setup. Software conversion uses the lower-work superfast preset with the existing bounded threads and low-delay settings.
- Share one resolution-aware bitrate profile between capture and FFmpeg. High quality at 720p/30 now targets 2.889 Mbps video instead of 6.5 Mbps; explicitly selected larger resolutions still scale upward. This is a target bitrate, not a measured public-network throughput guarantee.
- Account for video and approximately 50 audio packets per second in the two-second output FIFO budget, retain keyframe-based overflow recovery, and impose a five-second output write timeout. An overflow warning expires after eight seconds without another overflow once output progress is reported; slow-processing speed remains separately visible.
- After an encoder/input stall, close the old encoder input and request a new MediaRecorder/FFmpeg session with a fresh header and keyframe. Never discard random dependent input chunks into an existing decoder. Retries back off to at most 15 seconds; repeated stalls reduce only the stream to low-bandwidth 720p and at most 30 fps. Program and display resolution are unchanged. The operator can disable automatic recovery, and Stop cancels pending retries.
- Recognize sustained stream-copy delivery from its output timestamp: FFmpeg stream copy does not print an encoded-frame counter. Preserve the frame-based startup check for transcoding.

Validation: all 210 unit checks pass. Production type-check/build pass. The real streaming service delivered **1200/1200 frames at 720p/30 over 40 seconds** using H.264 reuse into a local RTMP receiver, with sustained-live status at 2.33 seconds and no app-side error. Actual Electron hook/MediaRecorder checks verify a fresh recorder on automatic recovery, lower-load retry after a second stall, cancellation on manual Stop, retained capture errors when recovery is disabled, and clean manual retry. Both six-second release checks also delivered 180/180 frames, through software conversion and H.264 reuse respectively. Every desktop release tests both paths against local RTMP.

These tests isolate the identified application paths; they do not simulate the user's exact PC workload, Internet uplink, public ingest service, or viewer playback. Public-network recovery can interrupt output briefly and still requires sufficient upload capacity. A private/unlisted broadcast after installation remains the end-to-end check.


## v0.6.31: browser-window recovery, browser timestamps, YouTube confirmation and chat

The supplied `streaming-2026-10-22T16-38-28-813Z.log` reports repeated non-monotonic video DTS corrections in the H.264 reuse path while processing near real time. Chrome's millisecond input time base was converted into a coarse 1/30 output time base. The previous constant-rate FFmpeg fixture did not expose this browser-specific mismatch. Stream copy now uses `-copytb 1`, the [documented demuxer time-base option for variable-frame-rate copying](https://ffmpeg.org/ffmpeg-all.html). Actual Chromium H.264/Opus media delivered all 330 frames through local RTMP without timestamp errors. The integration check now rejects timestamp collisions, source failures and stale receiver files.

Windows Graphics Capture supplies frames when the compositor supplies them, capped by the requested rate ([FFmpeg documentation](https://ffmpeg.org/ffmpeg-filters.html#gfxcapture)). Native output now uses `-fps_mode passthrough` instead of generating stale duplicate pictures after quiet/covered periods. A bounded temporary software decoder releases idle pictures without flushing the primary decoder, which would require a new keyframe and could strand a still window. History is limited to 120 packets/8 MiB; frames/decoders are closed and old presentation timestamps ignored. First-picture waiting is bounded to three seconds after native startup; automatic fallback tries software H.264 before JPEG compatibility. Explicit software capture skips GPU probes, and source validation enumerates only the requested source type.

A controlled still Chromium window was changed while another window covered it, then uncovered. A stricter test that changes the picture separately in each state measured 585 ms while covered and 257 ms after uncovering, using four encoded packets without stale duplicates. Broader checks also confirm moving capture, resizing, title changes and exclusion of a separate popup. External browser/driver combinations still require practical validation.

Performance: fix a cadence tolerance boundary that skipped valid following frames, while retaining a floating-point epsilon to skip missed frames without catch-up bursts. Avoid a second canvas copy when stream dimensions match Program. Shallow store selection and compositor memoization avoid work on unrelated state updates. A clean 20.02-second Full-HD/60 check measured Program, Preview, sanctuary and stream capture at 60 fps, with maximum gaps of 24/26/39/32 ms and zero busy capture drops. The full integration suite subsequently measured 60/60/60/59.6 fps, maximum gaps 26/27/42/37 ms, and no black transition frames. These are controlled PC measurements, not universal 60 fps or 8K guarantees. Earlier combined tests exposed cadence loss; measurements during renderer edits were discarded.

New YouTube stream endpoints use variable raster/rate detection instead of inferring 720p/1080p from compression quality; this also permits lower-load recovery to change stream dimensions. Existing endpoints are not modified during a broadcast. YouTube encoder activity is labeled **Sending video**. Destination cards independently check broadcast life-cycle, ingest and privacy, detect ended/unavailable broadcasts, and open the exact watch link. Monitoring does not publish broadcasts or open OAuth interactively. Unlisted broadcasts need a direct link; Private broadcasts restrict viewers. Active ingest with automatic start disabled still requires Go Live in YouTube Studio. See the official [broadcast](https://developers.google.com/youtube/data/live/reference/rest/v3/liveBroadcasts) and [stream](https://developers.google.com/youtube/data/live/reference/rest/v3/liveStreams) resources.

Connected broadcasts now expose live chat through the existing OAuth session. Read requests run only while open, never overlap, respect the server interval with a ten-second minimum, retain 150 messages and stop on closure/error/end. Text is rendered safely; message IDs are deduplicated. Send validates 1-200 characters and never retries a POST automatically. Permission, availability and quota errors remain visible. See [chat list](https://developers.google.com/youtube/data/live/reference/rest/v3/liveChatMessages/list) and [chat insert](https://developers.google.com/youtube/data/live/reference/rest/v3/liveChatMessages/insert).

Actual Electron/React chat verification uses mocked responses and verifies operator-triggered send, no automatic send, plain text, duplicate suppression and refresh cancellation. No message was posted to a real channel during tests. The user's own broadcast, chat permissions and Internet ingest still need an end-to-end check after installation.

Release validation: all 219 unit tests, the production type-check/build, the full Electron live-output suite, chat interface checks, and both production-service RTMP paths pass locally. Public YouTube ingest/chat require the user's own end-to-end check.

## v0.6.32: still-picture stream stalls, audio lifetime and responsive chat

The latest local log (`streaming-2026-10-23T15-14-57-990Z.log`) reports two FIFO overflows within roughly five seconds, despite processing near real time and retaining the corrected millisecond H.264 time base. An earlier log on October 23 still contains the previously fixed timestamp problem; the later logs do not. The logs alone cannot determine the public uplink's capacity.

The wider media-path review found two application defects. The compositor's unchanged-picture optimization also skipped video-capture notifications, reducing still scenes, Freeze and Cut to Black to the slower redraw heartbeat instead of the requested media cadence while audio continued. This can cause irregular batching and interleaving. Separately, Program recreated and closed its audio context/destination after scene/source/gain changes. Active stream/record sessions held the original audio output and could remain silent afterward. These are code findings; the public-network logs do not prove that sparse frames alone caused their FIFO overflows.

Corrections preserve the media clock while skipping unnecessary redraws, and keep a single 48 kHz stereo Program bus alive until the studio unmounts. Source routes are replaced independently of that bus. A zero-valued source maintains silence when no inputs are enabled. Suspended/interrupted audio contexts resume, and stream/record sessions own cloned tracks rather than extra unresumed audio contexts. Starting with audio disabled retains an audio track so later enabling audio works. Recording releases capture promptly on Stop and reports encoder errors.

The output FIFO now covers six seconds of video plus audio packets, exceeding the five-second network write timeout and accommodating media batches. This is a bounded capacity, not an intentional six-second delay. Audio/video interleaving is limited to 250 ms. Two overflows within 30 seconds request a fresh, lower-bandwidth stream when automatic recovery is enabled. Recovery is limited to five network attempts and no longer retries every unrecoverable error. Hardware fallback requests fresh capture rather than rejoining dependent WebM data with only a cached initial batch. See the official [FIFO options](https://ffmpeg.org/ffmpeg-formats.html#fifo).

Chat now places its full-width textarea and character count above a wrapping actions row. Changing broadcasts clears the previous draft, and an old send response cannot overwrite the new broadcast's draft/status. Browser checks verify no horizontal overflow at 420, 280 and 180 px, side-by-side buttons when space permits and wrapped buttons at 180 px.

Validation on this PC: 221 unit tests pass. The real Program compositor/mixer and simultaneous streaming/recording hooks preserve the same live audio bus through static scenes, Freeze, TAKE, gain edits, microphone replacement and black output. Decoded ten-second captures have no unexpected silent quarter-second windows after audio is enabled, maximum steady video gaps of 55 ms, and final audio/video drift of 25/31 ms. Starting a second browser encoder produced a bounded 329–363 ms gap during the first second, before sustained delivery; this startup interval is reported separately. The test starts with audio disabled and enables the microphone after capture has begun.

The production RTMP service delivered all 450/450 frames over 15 seconds through a simulated 3.5-second local transport pause, with 705 decoded AAC frames, 30 ms final A/V drift, maximum 21 ms audio packet gaps and no FIFO overflow. Tests reject missing audio, timestamp collisions, overflows and excessive A/V drift, rather than checking video frame count alone. `npm run verify:broadcast-continuity` runs the Electron regression; `node scripts/verify-stream-startup.cjs --encoder=x264 --ci --copy-video --seconds=15 --pause-output-ms=3500` runs the paused transport check.

The full live-output suite also passes: transitions, native fader, scrolling text, unavailable-source recovery, shared source decoding, native capture/window resizing, projection stall recovery and MP4 export. A 20-second Full-HD/30 check sustained 30 fps in Program, Preview, stream capture and sanctuary output, with maximum 39 ms capture/Program gaps and 54 ms sanctuary gaps. One native fader check missed a pointer event while the compiler ran concurrently; rerunning without that build load passed. Chromium emitted a VideoFrame garbage-collection warning during combined test teardown; the reviewed decoder paths explicitly close their frames, and a production leak was not established by that warning.

These controlled checks do not certify every application behavior or replace an end-to-end check of the user's YouTube ingest and viewers. No real broadcast or chat message is created by the tests.

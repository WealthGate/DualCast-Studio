# Live output reliability audit — through v0.6.28

The reported failures were traced through native capture, renderer media ownership, Preview/Program snapshots, transitions, frame encoding, projection decoding, LAN output, settings persistence, and dock controls. Existing tests also cover recording sessions, streaming transport/authentication/shutdown, hotkeys, display selection, libraries, and studio state. This is a bounded regression audit, not a guarantee that every external application or device behaves identically.

## Corrections

- Replaced Windows window-title/GDI capture with Windows Graphics Capture, addressed by HWND. GPU-rendered windows are captured without the cursor or window border. Separate desktop popups are excluded. Desktop capture retains its cursor-free screen path.
- Added a reproducibly downloaded, SHA-256 verified FFmpeg runtime for Windows window capture. Installers include it; users need no separate install. Its executable, license, and source/build references are packaged as extra resources.
- Removed canvas resets caused by scene, source, or fader changes. Preview and Program use persistent animation loops and backing bitmaps.
- Share live camera/display/window media between Preview and its matching Program snapshot, rather than reacquiring capture during TAKE. Layout changes no longer restart capture.
- Hold the previous Program picture until incoming media has real pixels. Transitions begin when the incoming scene is ready. Capture failure is visible and offers Retry.
- Composite complete scene frames at full brightness; Fade eases between pictures instead of fading through black. Preserve the outgoing picture during interrupted transitions.
- Encode audience frames after composition, rather than on an independent timer that can sample a cleared canvas. Serialize projection image decoding and retain only the latest pending frame.
- Preserve a frozen picture across Cut to Black and Restore. Hide the pointer on LAN audience pages as well as projection windows.
- Ignore outdated settings responses, preventing old asynchronous saves from reverting newer cue or gain changes.
- Remove redundant immediate-transition buttons and the duplicate Master Program Audio slider. Transition selection now configures TAKE; audio gain remains in Audio Mixer. Remove the duplicate current capture option in source Properties.
- Add a visual video-area crop selector for fixed meeting layouts; crops remain staged until TAKE.

## Verification

Run `npm test`, `npm run build`, `npm run verify:streaming`, and `npm run verify:live-output`.

The Electron check samples actual Program pixels and encoded audience frames during rapid fader movement, manual completion, Fade, and a deliberately delayed incoming source. It also exercises Freeze/Black/Restore, meeting-area crop exclusion, and a synthetic camera shared between Preview and Program. On Windows it captures a real native window, changes its title and size, and places a separate blue chat/notification window over it to verify exclusion.

Actual Zoom calls, third-party meeting overlays, hardware cameras, and venue displays still need a venue test. Window capture cannot remove UI composited inside the meeting video's pixels; use full-screen video, hide the meeting app's overlays, or select a fixed video region. Protected/minimized windows and new HWNDs require restoration or reselection. The graphics-capture change is Windows-specific; macOS/Linux retain their platform capture paths.
## v0.6.25 scrolling message and scene selection verification

- Added a dedicated scrolling-text source with a canvas clock per source/snapshot, resolution-scaled speed and fonts, four directions, repeating/single-pass playback, and pause/resume/restart.
- Background composition is cached; background opacity applies once. Fixed left/right logos reserve space outside the clipped text viewport.
- Preview changes are staged until TAKE; Program recording/streaming/display paths reuse the composed picture. Independent sanctuary output receives enabled committed scrolling sources.
- Scene Sources follows Preview in Studio Mode and Program in Program Focus. Switching scenes closes stale properties and clears source selection. Scene row clicks and keyboard-accessible name buttons select the scene.
- Validation: 156 unit tests pass; production build passes. Electron pixel checks pass for all four directions, logo placement/clipping, background image opacity, animation, pause/resume/restart, Program snapshot isolation, and source lists in both workspace modes. Existing nine transition buttons, native fader endpoint handling, cold-source hold, encoded output, and Windows window capture checks pass with zero unexpected black frames. Streaming transport decodes 360 frames without decoder errors in the production timing modes.
## v0.6.26 frame delivery and buffering audit

The audit traced native screen/window capture, browser sources, Preview/Program composition, sanctuary windows, lower-third and Multiview output, LAN viewing, browser recording, WebM delivery, FFmpeg encoding, and RTMP output recovery.

Confirmed bottlenecks and corrections:

- Local sanctuary output formerly JPEG-encoded the entire Program canvas, base64-serialized it through IPC, and decoded an image for every displayed frame. It also capped delivery at 30fps. Local displays now receive a video track through local-only WebRTC signaling; capture follows completed Program draws. The negotiated frame-rate limit follows the selected setting. JPEG remains a compatibility fallback, with one in-flight frame and one latest replacement per display.
- Preview formerly rendered the full 1080p/1440p bitmap even in a small dock. Its bitmap now follows the visible pane and display scale while preserving Program-coordinate composition. Program retains its selected output resolution.
- Render clocks formerly depended on the operator monitor's animation-frame cadence, and streaming copied Program on an independent interval. Output now uses a phase-preserving timer and completed-frame subscriptions, including raising Program's cadence when an active stream requests a higher frame rate. Manual capture prevents two capture timers from dropping frames between draws.
- Native cursor-free capture followed a fixed 30fps acquisition rate and could queue IPC images when decoding fell behind. It now follows the requested capture rate (up to 60), waits for decoder acknowledgements, and retains only the latest pending frame. The pointer remains excluded at acquisition.
- Browser sources were sampled at 10fps with repeated PNG screenshots. They now use Chromium's offscreen paint events and the requested frame rate. Browser image decoders retain only the latest pending frame. LAN viewing also no longer uses a fixed 10fps poll or overlapping image requests; its separate JPEG preview is limited to 720p to reduce shared rendering pressure.
- Multiview thumbnails formerly encoded every tile synchronously in one batch. They now encode sequentially and asynchronously with one batch in flight, yielding to Program rendering and cancelling outdated batches.
- A slow FFmpeg destination formerly delayed every destination through a shared awaited delivery operation. Each destination now has an independent ordered queue, bounded to eight chunks/4MiB and a 1.5-second input age/stall deadline. Dependent WebM chunks are never randomly discarded into a live decoder. A stalled destination fails with a visible error while healthy destinations continue. Graceful stop drains accepted input before EOF.
- FFmpeg's input probing is explicitly bounded to 256KiB/0.5 seconds, retaining initial keyframes and the existing CBR, two-second keyframe, bounded FIFO and keyframe recovery behavior. See [FFmpeg's input and FIFO options](https://www.ffmpeg.org/ffmpeg-formats.html).
- Remote image sources now request CORS permission before entering the compositing canvas, preventing a remote image from tainting recording/stream capture. Unsupported remote URLs report an image error and can be replaced by a local file.

Validation includes regression tests for queue isolation/age/byte limits, ordered shutdown, frame acknowledgements, native 60fps arguments and pointer exclusion, early signaling candidates, and local video codec settings. Electron tests exercise the actual preload, signaling router and Projection component across renderer windows, including immediate black/restore. The visible Add Scrolling Text shortcut is also exercised.

Validation passed: 166 unit tests, production build, all nine transition buttons, native fader handling, cold-source hold, meeting-area cropping, native Windows capture across title/size changes and a covering notification window, fixed ticker logos and the visible scrolling-text shortcut, production projection/preload/IPC across renderer windows, and browser offscreen paint capture. Streaming transport decoded all 360 frames without decoder errors in the production input/timing modes. No unexpected black transition or encoded output frames were observed.

Repeated requested-30fps runs on this PC, using 1080p sanctuary output plus simultaneous 720p streaming capture, measured 28.3–30.0 Program fps, 23.5–29.0 decoded sanctuary fps and 27.7–30.2 stream-capture fps, with 16.3–42.6ms average decoder jitter buffering and no JPEG fallback. Performance varied with the PC's existing broadcast/browser workload. A separate 60fps stress run delivered 55.9 Program fps and 54.5 stream-capture fps but could not sustain 60fps sanctuary decoding. Higher-rate sanctuary performance therefore still requires adequate encoder/decoder/GPU capacity; this update does not guarantee 60fps on every PC. Internet uplink, ingest-server and viewer-player buffering remain outside the local frame pipeline.

## v0.6.27 shared freeze and moving-video follow-up

The follow-up reproduced a scene-wide hold: Preview and Program returned without drawing whenever any enabled source reported not-ready, even after the scene had already been live. The earlier short ticker-only benchmark also did not expose the software VP8 encoder's poor throughput on moving pictures.

Corrections:

- Scene warm-up holds are bounded to 750 ms. Once a scene is live, one buffering source cannot pause the other layers. Failed sources report their error without blocking the scene.
- Windows capture is composited directly from its decoded canvas. It no longer sends each native frame through a second captureStream/hidden-video queue before Preview and Program can draw it. Identical camera/window/display/image sources share acquisition even under different source IDs.
- JPEG fragments are assembled once per frame. Base64 conversion is deferred until a frame is actually sent; superseded frames allocate no base64 string. Capture conversion threads are bounded and MJPEG uses 4:2:0 pixels.
- Frame decoding uses explicitly closed ImageBitmaps, retains one latest replacement, acknowledges timed-out decodes after 500 ms, and ignores late completions. One failing output consumer cannot block other subscribers.
- Local sanctuary delivery prefers H.264 where available and scales capture to 720p before encoding. Program and recording retain the selected resolution. Identical sanctuary/stream capture conversions share one canvas and use independent cloned tracks.
- A connected sanctuary video is now checked for actual decoded-frame progress. A decoder stalled beyond 750 ms holds its last picture, enables compatibility fallback and requests reconnection; stale peer callbacks cannot undo a newer connection.
- LAN JPEG work skips busy encoders. Its auxiliary view is limited to 720p/15 fps at 30 fps Program settings, or 360p/10 fps when Program requests more than 30 fps. This protects the primary displays and recording/stream paths from readback pressure.

Verification now includes real moving video over a 20-second measurement, longest frame gaps for Preview, Program, sanctuary and streaming capture, source underflow after going live, an unavailable overlay, duplicate native capture IDs, and a connected decoder stall. Test browser profiles live outside OneDrive to avoid profile syncing distorting results. The optional 1440p/60 fps plus LAN stress check retains its strict requested-cadence assertion; it reports failure when the PC cannot sustain that rate, rather than treating it as a 60 fps pass.

On this PC, a 1080p Program/720p sanctuary/720p stream moving-video run measured 29.9 Program fps, 29.0 sanctuary fps and 29.7 stream-capture fps. Maximum measured gaps were 80 ms Program, 79 ms Preview, 114 ms stream capture and 128 ms sanctuary. A heavier 1440p/60 fps plus LAN run after shared-capture optimization measured 40.0 Program fps, 26.9 sanctuary fps and 28.3 stream-capture fps; maximum gaps were 166/154/236/244 ms respectively. The heavy workload therefore remains above this PC's sustained 60 fps capacity. 1080p/30 fps is the verified operating target here; these figures do not guarantee performance on other hardware or Internet connections.

Final full Electron regression passed with all nine transition buttons, native fader return, zero black transition/encoded frames, all scrolling controls, buffering/unavailable-source continuation, one shared native encoder for duplicate windows, direct native canvas motion, connected-stall recovery through the real preload/router, offscreen browser paint, and real Windows capture despite resize/title/popup changes. In that busier full-suite run, the 20-second moving-video sample measured 28.2 Program fps, 24.6 sanctuary fps and 26.2 stream-capture fps; maximum gaps were 171 ms Program, 181 ms Preview, 372 ms stream capture and 280 ms sanctuary. All 174 unit tests and the production build passed.

## v0.6.28: 60 fps, hardware selection and explicit resolutions

The follow-up traced the remaining shared pressure through source acquisition, canvas composition, native capture IPC, local display encoding, generated capture tracks, browser recording, FFmpeg conversion and output queues.

Corrections:

- Local displays now share one WebCodecs encoder. A single hardware-encoded picture is sent to all local display windows through binary IPC and decoded directly into their canvases. Per-output dependency-aware queues are bounded to six packets and 200 ms; overflow waits for a keyframe. Connected-stall recovery requests a fresh keyframe and preserves the last picture. WebRTC and JPEG remain compatibility paths.
- Windows native capture uses asynchronously probed Quick Sync/NVENC/AMF H.264 where usable, or bounded CPU encoding, with binary packets and a hardware-first VideoDecoder. Native source dimensions are preserved instead of first scaling every captured window up to 1080p. Cursor exclusion and direct compositor canvas access remain in place. JPEG compatibility capture remains available.
- Matching file-video playback is decoded once for Preview and Program. Different pause/restart commands fork ownership. Cameras request the selected acquisition frame rate and dimensions.
- Static scenes render only after visual state or media pixels change, plus a 250 ms heartbeat. Moving sources, transitions, lower-third animations and scrolling text retain their animation clocks. Preview follows the selected frame rate. Phase-preserving cadence tolerates timer jitter and skips missed frames without replay bursts after a stall.
- Recording and streaming share capture conversions at matching sizes/rates. Where available, generated video tracks replace automatic canvas capture with at most three in-flight VideoFrames. Every frame is closed after its write completes; cloned track ownership preserves independent consumer shutdown.
- Browser recording/streaming prefer supported H.264 in WebM at ordinary resolutions. Compatible H.264, AV1 and VP9 recordings are remuxed to MP4 without a second video encode. Other MP4 conversion is limited to two video threads.
- Independent resolution settings support 720p, 1080p, 1440p, 4K and 8K. Automatic Program/recording is 720p at Low quality and 1080p otherwise; automatic local display capture stays 720p. Resolution choices do not silently upscale smaller display/stream sources. 8K options require a hardware AV1 capability check at the chosen frame rate. An 8K stream also probes the chosen FFmpeg encoder at 7680×4320 before connecting and does not silently retry a failed hardware encoder using CPU at that resolution.
- Graphics settings report detected devices and active hardware compositing. Preferences use Electron's supported startup GPU switches or software rendering; they take effect after a normal restart. Streaming encoders reflect actual runtime probes across Windows/macOS/Linux, and Windows exposes the native capture encoder separately. Device detection does not imply every installed driver can encode video.

Verification on 22 October 2026:

- 199 unit tests pass, including bounded packet dependencies, frame closure, post-stall cadence, source sharing, platform GPU preferences and 8K probe failure handling. Type-check and production build pass.
- Full Electron regression passes all nine transition buttons, native fader endpoint/return behavior, cold-source hold, Freeze/Black/Restore, all scrolling directions and side logos, scene-source selection, buffering/unavailable-source continuation, native canvas motion, production preload/router video delivery, connected decoder stall/recovery, browser offscreen paint, and Windows capture through title/resize/popup changes. No unexpected black transition or encoded image frames were observed.
- Twenty-second moving-video plus scrolling-text test, with 1920×1080 Program, 1920×1080 local encoded display transport, 1920×1080 streaming capture, requested 60 fps and LAN viewing enabled: Program **59.6 fps**, Preview **59.5 fps**, decoded local display **59.6 fps**, streaming capture **59.5 fps**. Maximum gaps were **95/105/107/118 ms** respectively. One shared local encoder delivered 1,194 video packets. The 196 JPEGs belonged to the auxiliary LAN view, not local-display fallback. This benchmark measures the decoded video path in the producer renderer; a separate check verifies the actual Projection renderer/preload/router and recovery.
- Actual moving Windows Graphics Capture through production preload/IPC delivered **60.0 fps** at native 1264×680, with **175 binary video packets, zero JPEG frames**. The source was a controlled animation window, not an actual Zoom meeting.
- Six-second 60 fps generated-track H.264 recording decoded **355 frames** from 362 requested drawing ticks, with **57 ms** end audio/video drift; MP4 video-copy export passed. A separate recording-only run decoded 319 frames with 45 ms drift, demonstrating normal workload variability.
- The Settings UI test detected Intel UHD Graphics 630, NVIDIA GeForce GTX 1050 Ti and Microsoft Basic Render Driver; saved GPU preference and disabled unsupported encoder/8K options correctly. Quick Sync and Media Foundation streaming were usable; the installed NVIDIA driver/runtime could not initialize NVENC. No driver was changed.

Physical macOS/Linux GPUs, venue screens, Internet ingest and viewers were not available for performance testing here. Cross-platform unit checks and release builds verify integration, not identical hardware throughput. This PC does not support the chosen hardware 8K encoding path, so 8K/60 fps has **not** been benchmarked. Choose 1080p/60 first, test the actual venue workload, and increase resolution only when the encoder, GPU, memory, source and destination can sustain it. Internet and viewer buffering remain outside these local pipeline measurements.

# Live output reliability audit — v0.6.23

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

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

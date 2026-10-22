# OpenChurch Broadcast Studio

OpenChurch Broadcast Studio is an open desktop production suite for churches and large venues. It combines live presentation, multi-display projection, lower thirds, recording, multi-destination streaming, operator controls, audio mixing, Multiview, and lightweight post-production in one interface.

Scripture text must always be displayed without source markup or stray angle delimiters (`<`, `>`, `‹`, `›`), including encoded versions. Preserve the scripture's words and normal punctuation. This is a permanent requirement across future updates, protected by the shared scripture sanitization regression tests.

Press **Escape** while the studio or any display window is focused to close all Program, lower-third, and Multiview display windows and return to the studio controls, including when presenting on the primary screen.

## Download

Download the current Windows, macOS, or Linux installer from the [latest GitHub release](https://github.com/WealthGate/DualCast-Studio/releases/latest).

Current release: **v0.6.28**.

- Windows: download the `.exe` installer or portable `.zip`.
- macOS: download the `.dmg` or `.zip`.
- Linux: download the `.AppImage` or `.deb`.

The current builds are not code-signed. Windows SmartScreen or macOS Gatekeeper may therefore ask users to confirm that they trust the download.

Starting with v0.4.0, the installed app checks GitHub Releases automatically. The v0.6.9 header keeps an update button visible at all times, shows the installed version, changes to `Update to v[version]` when a newer release is detected, reports download progress, and then changes to `Restart & Install`. `Menu > Check for Updates` remains available as an additional manual check, and the alert includes a GitHub download fallback.

### What's new in v0.6.28

- Open **Controls → Settings → Graphics and video acceleration** to view detected graphics devices, choose Automatic, High-performance GPU, Power-saving GPU or Software rendering, and select a usable streaming encoder. Restart after changing the graphics preference. The OS selects the matching GPU.
- Available encoders are tested with the installed drivers: NVIDIA NVENC, Intel Quick Sync, AMD AMF, Windows Media Foundation, Apple VideoToolbox, Linux VA-API/V4L2, or CPU x264, according to the platform/runtime. Windows also has a separate native capture encoder selector. Unsupported options are disabled.
- Reduce repeated video decoding and static scene rendering. Share one low-latency hardware video encoder across local displays; Windows capture uses binary H.264 instead of a JPEG/base64 round trip for each frame, with a compatibility fallback.
- Choose Program/recording and live-display resolutions in Settings, and stream resolution in Stream Setup: HD, Full HD, QHD, 4K and 8K. Compression quality is separate from resolution. Displays and streams preserve smaller source dimensions. 8K requires compatible hardware AV1 encoding at the selected frame rate; streaming also validates the output encoder's 8K dimensions before connecting.
- Improve 60 fps capture pacing, bounded video-frame delivery, decoder recovery, and fast MP4 export without re-encoding compatible recorded video. See [the measured live-output audit](docs/live-output-audit.md) for results and hardware limits.

### Included from v0.6.18

- Reduce streaming load by sizing capture before browser encoding and delivering smaller, ordered media batches.
- Preserve initial WebM keyframes to prevent startup decoder errors and missing video.
- Bound network recovery queues and encoder stalls to prevent growing stream delay; show warnings when delivery cannot keep up.
- Encode lower-third projection images asynchronously to reduce rendering stalls.
- Verify the bundled FFmpeg's frame delivery in every desktop release build. See [streaming stability audit](docs/streaming-stability-audit.md) for evidence and testing limits.

### Included from v0.6.17

- Stop streaming without an unhandled `write EOF` error: drain the encoder input, handle late pipe errors, and ignore events from stopped encoders.
- Browse other studio tabs while streaming. Live status updates no longer repeat a previous request to focus Stream Setup.

### Included from v0.6.16

- Strip stray scripture angle delimiters, including `‹ ›` and encoded forms, while preserving verse wording and punctuation.
- Press Escape from the studio or display windows to close Program, lower-third, and Multiview displays and return to the controls.
- Verify YouTube permissions, reconnect outdated sign-ins, and explain channel live-streaming restrictions. Stream addresses and keys are filled automatically after broadcast creation.

### Included from v0.6.15

- Hide Scripture beside Show Live clears the displayed Scripture from Preview, Program, and connected outputs while retaining the passage and slides for reuse.

### Included from v0.6.14

- Replace the Scripture start/end range selectors with a Jump to verse field for the current chapter.
- Press Enter or Show Live to display the entered verse immediately in Preview and Program.
- Remember the selected Scripture Source across restarts. Importing, downloading, saving, or removing libraries does not switch sources automatically.

### Included from v0.6.13

- Hold Alt (or your chosen modifier) and drag source corners in Preview to trim before TAKE.
- Edit Source replaces media files, camera devices, capture targets, URLs, and text.
- Configure recording, TAKE, and cut-to-black hotkeys in Menu; unavailable shortcuts report an error.
- Show Live (Enter) beside Scripture selection loads and displays the passage in Preview and Program immediately.
- Previous Verse and Next Verse immediately display adjacent verses within the chapter.
- Scripture slide creation and offline saving are grouped beside passage selection.

### Included from v0.6.12

- Enter shows manual, edited, or selected lower-thirds in Preview and Program together.
- Add to Queue appends manual text without changing the current output; Shift+Enter preserves multiline editing.
- Scripture Enter fetches and publishes the requested verse in one action.
- Cleans encoded markup, footnote markers, and per-verse Scripture slide text before display.

### Included from v0.6.11

- Fixes projection startup losing its initial Program state and remaining black.
- Registers output window lifecycle handlers before loading the output page.
- Encodes Program projection frames asynchronously, with one frame in flight to limit CPU work on slower PCs.
- Refreshes frozen output periodically so newly opened projectors receive a frame.

### Included from v0.6.10

- Detects projection monitors directly and refreshes the list when screens are connected or removed.
- Adds a Refresh button in Sanctuary Displays.
- Adds scene and source visibility, lock, edit, and remove icons, plus source ordering and audio controls.
- Preserves scene visibility through saved settings and the Preview/TAKE workflow.

### Included from v0.6.9

- Adds directional drop targets that split docks into separately resizable neighboring panels.
- Keeps center drops as persistent tabs and allows an existing tab to be pulled into its own panel.
- Preserves the top-left application menu as a non-dockable area and clarifies the docking guidance in the workspace.

### Included from v0.6.8

- Removes unused media and streaming exports identified by a whole-source redundancy audit.
- Replaces duplicated recording/stream timers and RTMP URL validation with single shared implementations.
- Reuses one pointer-resize cleanup path for both dock-zone and dock-group resizing.
- Adds focused regression tests for the shared timer and RTMP validation behavior.

### Included from v0.6.7

- Consolidates streaming, recording, Stream Setup, TAKE, one highlighted Studio Mode toggle, Auto Configure, and Settings in the Controls dock.
- Expands the desktop File menu and adds reusable Profiles for complete scene and settings arrangements without exporting protected secrets.
- Adds guided YouTube and Facebook account setup inside System Settings, secure credential/token storage, account reuse, and an explicit Change Account path.
- Creates and binds YouTube broadcasts with title, visibility, category, audience, schedule, latency, DVR, auto-start/stop, and embedding choices.
- Adds an Auto-Configuration Wizard based on the venue upload speed and encoders that actually pass a local hardware test.
- Sends lyric, Scripture, and Text sources directly to Program on double-click and removes API markup or stray angle brackets from Scripture.
- Keeps one FFmpeg decoder alive through temporary RTMP output recovery, avoiding invalid mid-WebM decoder restart loops.
- Adds direct-to-disk long-service recording, local Program audio monitoring, expanded encoder compatibility, and focused regression tests.

### Included from v0.6.6

- Fixes Windows live streaming repeatedly reconnecting with an `ffmpeg.exe ENOENT` error after installation.
- Resolves the bundled FFmpeg executable from `app.asar.unpacked`, where Windows, macOS, and Linux can launch it safely.
- Applies the same packaged FFmpeg resolution to live streaming, final MP4 recording conversion, and Post Editor clip export.
- Explicitly unpacks `ffmpeg-static` during packaging and stops futile reconnect attempts when the executable is missing or cannot be launched.
- Adds regression coverage for development, Windows installed, and macOS/Linux installed paths, plus a real packaged-Windows executable check.

### Included from v0.6.5

- Makes the Cut, Fade, and Crossfade controls immediately send Preview to Program; a separate TAKE click is no longer required after choosing one.
- Keeps TAKE available with the most recently selected transition for keyboard, remote-operator, and dedicated-control workflows.
- Prevents an invalid or missing Preview scene from clearing a valid live Program scene.
- Persists every Program scene change consistently, including transition buttons, TAKE, Multiview, Program Focus, and completed manual blends.
- Removes obsolete insecure legacy stream-key records while preserving keys protected by operating-system secure storage.
- Enables stricter unused-code compilation and reports streaming shutdown failures instead of leaving rejected cleanup operations unhandled.

### Included from v0.6.4

- Separates staged Preview text from live Program text, so lyrics and Scripture can be checked privately before TAKE or **Take Text Live**.
- Enforces one managed presentation-text layer by default; staging lyrics, Scripture, or a presentation text source removes the previous managed text from Preview while leaving ordinary text sources untouched.
- Adds an explicit **Allow more than one text presentation on screen** override for intentional text layering.
- Adds a click-based Bible book, chapter, start-verse, and end-verse picker with Enter-to-load support for online and downloaded translations.
- Creates Scripture decks as one verse per slide, automatic lines per slide, or a complete-passage slide, using the existing Bible branding and animated lower-third transitions.
- Adds offline song storage with HTTPS download and TXT, Markdown, or JSON import, plus automatic lyric wrapping and selectable one-to-six lines per slide.
- Keeps Previous/Next navigation inside the selected song or Scripture deck, preventing an operator from accidentally jumping into another presentation.

### Included from v0.6.3

- Adds lyric-editor controls to insert a new slide directly after the current slide or turn every non-empty edited line into its own ordered slide.
- Adds Program Focus mode: Program fills the combined Preview/Program workspace while operating docks remain visible, and one scene click sends that scene directly live.
- Keeps the existing Full Program Only mode for an uncluttered live view with all docks hidden.
- Adds a manual live blend fader that can hold any Preview/Program mixture, reset to Program, or complete Preview into Program; timed transitions now support up to 15 seconds.
- Routes a persistent microphone or persistent source audio across every scene, while retaining per-scene audio choices.
- Replaces static audio indicators with live mono/stereo meters, master metering, warning range, and clipping alerts.
- Adds lower-third transparency, background images, separate Bible branding, editable lyric slides, and transparent dedicated output.
- Adds online/downloaded/offline Scripture libraries plus lower-third, full-screen, half-screen, 3/4-screen, and custom scene layouts.
- Adds Studio, dock-preserving Program Focus, and Full Program Only views, plus lower frame-rate choices, source crop controls, and hidden-cursor capture.
- Writes recordings to disk incrementally instead of retaining an entire long service in memory.
- Hardens settings recovery, source cleanup, crossfades, updater scheduling, streaming backpressure, browser-source validation, provider authorization, and release-tag consistency.

## Current Capabilities

### Live Production
- Captures connected displays and builds layered scenes from display, camera, image, video, and text sources.
- Provides Preview and Program buses with TAKE, CUT TO BLACK, and FREEZE controls.
- Keeps every scene/source edit isolated in Preview until TAKE or an immediate Cut, Fade, or Crossfade snapshots it into Program.
- Applies Cut, Fade, or Crossfade immediately from the Scene Transitions dock while retaining TAKE as a separate control.
- Preserves the live Program media and audio graph while Multiview is open or Preview sources are edited.
- Opens a separate Multiview from `View > Open Multiview Window` with every configured scene and camera source.
- Sends a Multiview tile to Preview on single click and directly to Program on double-click.
- Uses a compact OBS-inspired control-room layout that prioritizes Preview and Program space.
- Keeps Preview and Program at matching dimensions for a balanced studio view.
- Separates Scenes and Sources into independent docks; selecting a scene shows only its attached sources.
- Lets operators drag docks to the top, bottom, left, or right of the workspace.
- Resizes dock columns, rows, and adjacent panels by dragging their visible boundaries.
- Merges panels dropped in another dock's center into persistent tabs, or splits them into separately resizable neighboring panels when dropped on a highlighted edge.
- Reveals dock, scene, and source actions only from right-click context menus to preserve workspace space.
- Saves each operator's dock arrangement and sizes locally, with hide, restore, and Reset Workspace Layout controls.
- Provides a Preview-first Lower Third Studio for manually typed messages, downloaded/imported songs, and pasted lyrics, with automatic wrapping, selectable lines per slide, add-after, and per-line slide creation.
- Keeps staged Preview text separate from live Program text and enforces one managed presentation-text layer by default, with an explicit multi-text override.
- Supports lower-third fonts, colors, alignment, emphasis, line limits, logos, arrow-key cueing, and entrance/exit animations.
- Records the Program canvas with configurable quality, frame rate, and System/Mic/Both/None audio modes.
- Writes recording chunks directly to a temporary disk session to keep memory stable during long services.
- Saves MP4 through bundled FFmpeg, with WebM fallback when conversion fails.
- Provides global record and cut hotkeys.
- Checks GitHub Releases automatically and provides one-click download plus restart-to-install update controls.

### Scripture and Song Presentation
- Selects Scripture by Bible version, book, chapter, start verse, and end verse, with Enter-to-load and typed-reference alternatives.
- Stores multiple downloaded/imported Bible translations offline and builds an exact book/chapter/verse catalog for each library.
- Splits passages by verse, by a chosen number of display lines, or as one complete slide, with shared lower-third branding and animations.
- Downloads permitted song lyric files by HTTPS or imports TXT, Markdown, and JSON songs for reusable offline presentation decks.

### Large-Venue Outputs
- Sends the same Program feed to multiple selected sanctuary projectors or displays.
- Provides Sanctuary Displays as a movable, tab-capable dock with direct monitor discovery, automatic hot-plug updates, and manual refresh.
- Provides a separate lower-third output for confidence monitors, broadcast graphics, or dedicated screens.
- Configures lower-third position, height, background, and target display.
- Publishes Program to browser-capable displays and OBS Browser Sources over the local network.
- Supplies a PIN-protected remote operator page for TAKE, freeze, black, and record controls.
- Supports operator station names and Director, Presentation, Streaming, Audio, and Viewer roles.

### Streaming and Audio
- Consolidates Stream Start/Stop, Stream Setup, Recording, one highlighted Studio Mode toggle, Auto Configure, and Settings in the Controls dock.
- Expands the native File menu with Recordings, Logs, Scripture Libraries, App Data, and Settings, and adds reusable create/duplicate/apply/import/export studio profiles without protected secrets.
- Provides an auto-configuration wizard that uses venue upload headroom and locally tested encoders to recommend stream, FPS, audio, recording, and encoder settings.
- Streams to multiple enabled RTMP/RTMPS destinations at the same time.
- Stores platform application credentials and reusable account tokens with operating-system encryption, opens the official account chooser in the system browser, and supports explicit Change Account / Disconnect actions.
- Creates and binds YouTube broadcasts from the stream setup, including public, unlisted, or private visibility, category, made-for-kids audience, schedule, latency, DVR, auto-start/stop, and embedding choices.
- Completes a manual Live Preview Blend at 100% and automatically resets its fader while preserving every intermediate blend position.
- Stores stream keys per destination when the operator opts in.
- Reports destination-level connecting, live, reconnecting, and error states.
- Uses broadly compatible VP8 ingest and a persistent FFmpeg decoder with recoverable output queues, avoiding mid-WebM decoder respawn loops after temporary network failure.
- Supports stream presets, encoder selection, audio bitrate controls, logs, and recovery reporting.
- Mixes source-level volume controls into a master Program audio gain.
- Routes microphones and audio sources per scene or persistently across all scenes, with dynamic mono/stereo meters and clipping warnings.
- Falls back to video-only capture when an otherwise valid desktop source does not expose an audio track.

### Church Content and Integrations
- Configures a local worship-song folder or Planning Center/custom song provider.
- Configures API.Bible, Bible API, or a custom Scripture provider.
- Fetches complete selected passages with their Book/Chapter/Verse reference and cues them to the lower third.
- Sanitizes online, imported, downloaded, and saved Scripture so API markup, encoded entities, zero-width characters, and stray wrapping angle brackets never appear on Preview or Program.
- Imports or securely downloads compatible licensed Scripture JSON libraries for offline lookup and display at lower-third, full, half, 3/4, or custom scene sizes.
- Keeps provider credentials outside normal settings by referencing environment-variable names.
- Configures OpenAI, Azure OpenAI, or a custom AI-compatible provider for future captions, summaries, and highlight suggestions.
- Defaults new OpenAI-compatible setups to `gpt-5.6-sol`; the provider can be changed without rebuilding the app.

### Post-Production
- Opens a recorded video, selects start/end times, and exports an H.264/AAC MP4 clip with FFmpeg.
- Opens the exported file location from the Editor panel.

## Large-Congregation Workflow

1. Build scenes and assign display, camera, media, and text sources.
2. Open Multiview from the View menu for a wall of live scene and camera feeds.
3. Mark text sources as Standard or Lower Third.
4. Select one or more main projector targets in the Sanctuary Displays dock.
5. Select a separate lower-third display if needed.
6. Enable the Venue LAN hub for wireless browser displays or an OBS Browser Source.
7. Add and enable every streaming destination in Streaming.
8. Set per-source and master audio levels.
9. Give authorized operators the LAN operator URL and PIN.
10. Record the Program output and create clips in Editor after the service.

## Wireless Display Setup

Wireless output uses the venue LAN rather than vendor-specific casting:

- Start the LAN hub in the Venue tab.
- Open the generated Program URL on a smart display, browser device, mini PC, tablet, or wireless HDMI receiver with a browser.
- Add the same URL as an OBS Browser Source when feeding streaming software.
- Keep production devices on a dedicated wired or managed Wi-Fi network where possible.

This approach works across display brands that can show a web page. Native Miracast, AirPlay, Chromecast discovery, NDI, and SDI hardware control are not yet built in.

## Setup

```bash
npm install
npm run prepare:windows-capture
npm run dev
```

Development and release packaging require Node.js 22.12 or newer.

Build and package:

```bash
npm run build
npm run package
```

Run tests:

```bash
npm test
npm run verify:live-output
```

Windows window capture uses a bundled Windows Graphics Capture runtime, downloaded and checksum-verified by `prepare:windows-capture` and included in PC installers. It captures the selected window without the cursor, window border, or separate desktop notification windows. For meeting apps, enter full-screen video and review Preview before TAKE. Source Properties includes **Select video-only area** for fixed layouts; UI drawn inside the selected video must be hidden in the meeting app. See [the live-output audit](docs/live-output-audit.md) for verification and limits.

## Provider Configuration

Streaming OAuth application credentials are entered under **Controls > Settings > System Settings > Streaming Accounts** and protected by the operating system; administrator-managed YouTube/Facebook environment variables remain supported as a fallback. Scripture and AI provider API keys are not saved in ordinary app settings. Enter the name of an environment variable in Venue, then set that variable before starting OpenChurch Broadcast Studio. Examples:

```powershell
$env:OPENAI_API_KEY="your-key"
$env:OPENCHURCH_SCRIPTURE_API_KEY="your-key"
npm run dev
```

Provider subscriptions and licensing remain the church's responsibility. Worship lyrics and Bible translations may have display, reporting, or streaming license requirements.

## Production Notes

- Screen and system-audio capture permissions vary by operating system.
- Each recording is captured as WebM internally and converted to MP4 after stop.
- Each stream session writes a log under the app user-data `logs` directory.
- Stream keys are stored only when Remember Stream Key is enabled.
- Download the complete PDF manual from `Menu > Download User Guide`.
- Hardware encoders depend on the bundled FFmpeg build and machine drivers.
- Use wired Ethernet for the production computer and critical outputs whenever possible.

## Known Limits

- Main sanctuary projector targets share one selected layout: Mirror Program or Independent Layout. The lower-third bus remains a separate auxiliary output.
- Remote operators provide focused control actions, not simultaneous collaborative scene editing or conflict resolution.
- Song and AI panels provide adapter/settings foundations; paid provider calls still require credentials, subscriptions, and any required provider review.
- AI live captions, sermon summaries, and highlight detection are not executed in v0.6.9; the current controls only prepare provider settings for a future implementation.
- The post-production editor currently provides trim/export rather than a multitrack timeline.
- Wireless receivers must support a browser or be connected through streaming software; native casting protocols are future extensions.
- Direct-to-disk recording still needs free space in the operating system's temporary directory and the selected save directory. A forced shutdown or power loss before Stop can leave the active recording incomplete; stale temporary sessions are removed when the app next starts.
- Final MP4 conversion runs after recording stops; allow time and free disk space for FFmpeg to finish long services.

## Project Structure

- `electron/` — main process, FFmpeg services, outputs, storage, IPC, and hotkeys
- `electron/preload.ts` — secure renderer bridge
- `src/renderer/` — React production interface and capture pipeline
- `src/shared/` — shared types and IPC constants
- `src/services/` — service interfaces and extension points


## Display and Audio Controls

Use the single **All outputs** row above Preview and Program to show or hide text, display the theme alone, or display the configured logo alone. **Hide Lower Third / Show Lower Third** hides or restores the entire lower third on Preview, Program, and the separate lower-third output without clearing its content.

In **Audio Mixer**, use the **Stereo / Mono** button for the Program mix. Mono combines left and right and sends the result to both speakers; Stereo preserves the channels. The setting applies to Program monitoring, recordings, and streams and is saved between sessions.

The workspace supports windows down to 640 × 480. At compact widths the displays appear above the docks, panels wrap or scroll, and controls remain reachable. Larger windows retain the resizable dock layout.


In **Sanctuary Displays**, choose **Mirror Program** to send the Program picture directly to the congregation screens. Choose **Independent Layout** to give those screens their own color, image, or looping-video background and text style. Follow live Program text (Scripture, lyrics, or scene text) or enter sanctuary-only text. Font, size, color, alignment, text position, background fit, and dimming are independent of Program. Review the sanctuary preview and select **Apply Sanctuary Layout**. The background video is muted. These layout settings are saved between sessions; recordings, streams, and the separate lower-third output keep their Program layout.

## Scrolling text

Click **Add Scrolling Text** directly in the Sources panel, or add a **Scrolling Text / Ticker** source from Add Source, for customizable announcements with four directions, speed, fonts, colors, background images, positioning, and an optional fixed logo on either side. Edit in Preview, then TAKE to Program. Scene selection shows the associated sources in both Studio Mode and Program Focus. See the [user guide](docs/OpenChurch-Broadcast-Studio-User-Guide.md#scrolling-messages-and-side-logos).

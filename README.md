# DualCast Studio (Phase 2a)

DualCast Studio is a cross-platform desktop app for selecting a display source, previewing it, pushing it to Program, recording Program output, and streaming Program to RTMP endpoints. This Phase 2a milestone lays the groundwork for more advanced streaming controls, conferencing, editing, AI, and accounts.

## Features in Phase 2a
- Enumerates connected displays with thumbnails and resolution.
- Preview and Program panes with TAKE, CUT TO BLACK, and FREEZE controls.
- Records Program output only (canvas-based) with audio modes (System/Mic/Both/None).
- MP4 output via FFmpeg remux (WebM fallback when FFmpeg fails).
- Global hotkeys for record and cuts.
- Settings for save directory, quality preset, frame rate, and last display memory.
- Streams Program output to RTMP endpoints (FFmpeg + x264 + AAC).

## Setup
1. Install dependencies
   ```bash
   npm install
   ```
2. Start the app (development)
   ```bash
   npm run dev
   ```
3. Build renderer + Electron bundles
   ```bash
   npm run build
   ```
4. Package installers
   ```bash
   npm run package
   ```

## Production Notes
- **macOS Screen Recording Permission**: Users must grant Screen Recording access in System Settings > Privacy & Security > Screen Recording. If the preview is black, check this permission.
- **Audio Capture**: System audio availability varies by OS. The app will warn if system audio is unavailable.
- **FFmpeg**: `ffmpeg-static` is used for remuxing WebM to MP4 after recording. If it fails, the recording is saved as WebM.
- **Streaming Logs**: Streaming logs are written to `app.getPath("userData")/logs/streaming.log` (for example on Windows: `C:\Users\<you>\AppData\Roaming\DualCast Studio\logs\streaming.log`).

## Streaming to YouTube (RTMP)
1. Open YouTube Studio and create a live stream.
2. Copy the RTMP URL (Server URL) and Stream Key.
3. Paste the RTMP URL and Stream Key into the Streaming panel in DualCast Studio.
4. Click Start Stream. Status should move from Connecting to Live.
5. Click Stop Stream when finished.

## Common Streaming Failures
- **Invalid RTMP URL**: Ensure the URL starts with `rtmp://` or `rtmps://`.
- **Missing FFmpeg**: Reinstall dependencies or provide a compatible ffmpeg binary.
- **No Program Source**: Select a display and TAKE it to Program before streaming.
- **Stream Ends Immediately**: Check the RTMP URL/key and review the streaming log.

## Project Structure
- `electron/` main process, IPC, permissions, logging, hotkeys
- `electron/preload.ts` secure IPC bridge
- `src/renderer/` React UI and capture logic
- `src/shared/` shared types, constants, and utilities
- `src/services/` Phase 2 service interfaces (stubs)

## Phase 2+ Roadmap (Extension Points)
- **Streaming**: Expand presets, bitrate metrics, and WHIP output.
- **Conferencing**: Implement `IConferenceService` for multi-user rooms and remote feeds.
- **Editor**: Implement `IEditorService` for timeline editing and export presets.
- **AI**: Implement `IAIService` for transcription and highlight detection.
- **Accounts/Billing**: Implement `IAccountsBillingService` for sign-in and subscription state.

## Known Limitations
- Large recordings are held in memory before saving; Phase 2 should stream to disk.
- System audio capture may be unavailable on some Linux distributions.
- Recording is WebM internally and remuxed to MP4 after stop.
- Streaming uses fixed 1080p30/x264 defaults; presets and metrics are planned for Phase 2b.

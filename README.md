# DualCast Studio (Phase 2b)

DualCast Studio is a cross-platform desktop app for selecting a display source, previewing it, pushing it to Program, recording Program output, and streaming Program to RTMP endpoints. This Phase 2b milestone hardens streaming with presets, stats, and reconnect logic while laying the groundwork for conferencing and editing.

## Features in Phase 2b
- Enumerates connected displays with thumbnails and resolution.
- Preview and Program panes with TAKE, CUT TO BLACK, and FREEZE controls.
- Records Program output only (canvas-based) with audio modes (System/Mic/Both/None).
- MP4 output via FFmpeg remux (WebM fallback when FFmpeg fails).
- Global hotkeys for record and cuts.
- Settings for save directory, quality preset, frame rate, and last display memory.
- Streams Program output to RTMP endpoints (FFmpeg + x264 + AAC).
- Streaming presets for resolution/bitrate + FPS and audio bitrate controls.
- Encoder auto-detection with graceful fallback.
- Live streaming stats (fps/bitrate/time) and reconnect strategy.
- Stream key storage with opt-in remember toggle.

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
- **Streaming Logs**: Each stream session writes a log to `app.getPath("userData")/logs/streaming-<timestamp>.log` (for example on Windows: `C:\Users\<you>\AppData\Roaming\DualCast Studio\logs\streaming-2026-01-14T02-30-00-000Z.log`).
- **Stream Key Storage**: Stream keys are only stored when “Remember Stream Key” is enabled. If OS encryption is unavailable, the key is encrypted locally (still stored on disk).

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

## Phase 2b QA Checklist
- Start/Stop streaming multiple times in a row.
- Kill network mid-stream and confirm reconnect attempts and recovery.
- Verify macOS permissions flow for screen/audio capture.
- Remove or block FFmpeg and confirm the UI reports the failure.
- Force encoder fallback by selecting an unavailable encoder.

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
- Streaming presets are tuned for typical RTMP targets; advanced metrics and auto-bitrate are future work.
- Hardware encoder availability depends on the bundled FFmpeg build.
- If OS encryption is unavailable, locally encrypted stream keys are still stored on disk.

## Phase 3 Next Step
Pick one:
- Conferencing MVP (room join/leave, remote video tiles).
- Editor MVP (timeline ingest and export presets).

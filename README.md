# OpenChurch Broadcast Studio

OpenChurch Broadcast Studio is an open desktop production suite for churches and large venues. It combines live presentation, multi-display projection, lower thirds, recording, multi-destination streaming, operator controls, audio mixing, Multiview, and lightweight post-production in one interface.

## Download

Download the current Windows, macOS, or Linux installer from the [latest GitHub release](https://github.com/WealthGate/DualCast-Studio/releases/latest).

Current release: **v0.5.0**.

- Windows: download the `.exe` installer or portable `.zip`.
- macOS: download the `.dmg` or `.zip`.
- Linux: download the `.AppImage` or `.deb`.

The current builds are not code-signed. Windows SmartScreen or macOS Gatekeeper may therefore ask users to confirm that they trust the download.

Starting with v0.4.0, the installed app checks GitHub Releases automatically. When a newer version is available, it shows the exact version number and lets the operator download it, then restart and install. `Menu > Check for Updates` runs a manual check, and the alert includes a GitHub download fallback.

## Current Capabilities

### Live Production
- Captures connected displays and builds layered scenes from display, camera, image, video, and text sources.
- Provides Preview and Program buses with TAKE, CUT TO BLACK, and FREEZE controls.
- Opens a separate Multiview from `View > Open Multiview Window` with every configured scene and camera source.
- Sends a Multiview tile to Preview on single click and directly to Program on double-click.
- Uses a compact OBS-inspired control-room layout that prioritizes Preview and Program space.
- Keeps Preview and Program at matching dimensions for a balanced studio view.
- Separates Scenes and Sources into independent docks; selecting a scene shows only its attached sources.
- Lets operators drag docks to the top, bottom, left, or right of the workspace.
- Resizes dock columns, rows, and adjacent panels by dragging their visible boundaries.
- Merges panels dropped on another dock into persistent tabs and previews the target before docking.
- Reveals dock, scene, and source actions only from right-click context menus to preserve workspace space.
- Saves each operator's dock arrangement and sizes locally, with hide, restore, and Reset Workspace Layout controls.
- Supports live text changes so an operator can update projected words, notices, or lower thirds without rebuilding the scene.
- Records the Program canvas with configurable quality, frame rate, and System/Mic/Both/None audio modes.
- Saves MP4 through bundled FFmpeg, with WebM fallback when conversion fails.
- Provides global record and cut hotkeys.
- Checks GitHub Releases automatically and provides one-click download plus restart-to-install update controls.

### Large-Venue Outputs
- Sends the same Program feed to multiple selected sanctuary projectors or displays.
- Provides Sanctuary Displays as a movable, tab-capable dock.
- Provides a separate lower-third output for confidence monitors, broadcast graphics, or dedicated screens.
- Configures lower-third position, height, background, and target display.
- Publishes Program to browser-capable displays and OBS Browser Sources over the local network.
- Supplies a PIN-protected remote operator page for TAKE, freeze, black, and record controls.
- Supports operator station names and Director, Presentation, Streaming, Audio, and Viewer roles.

### Streaming and Audio
- Streams to multiple enabled RTMP/RTMPS destinations at the same time.
- Stores stream keys per destination when the operator opts in.
- Reports destination-level connecting, live, reconnecting, and error states.
- Supports stream presets, encoder selection, audio bitrate controls, logs, and reconnect attempts.
- Mixes source-level volume controls into a master Program audio gain.

### Church Content and Integrations
- Configures a local worship-song folder or Planning Center/custom song provider.
- Configures API.Bible, Bible API, or a custom Scripture provider.
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
npm run dev
```

Build and package:

```bash
npm run build
npm run package
```

Run tests:

```bash
npm test
```

## Provider Configuration

Provider API keys are not saved in ordinary app settings. Enter the name of an environment variable in Venue, then set that variable before starting OpenChurch Broadcast Studio. Examples:

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
- Hardware encoders depend on the bundled FFmpeg build and machine drivers.
- Use wired Ethernet for the production computer and critical outputs whenever possible.

## Known Limits

- Main projector outputs currently mirror one Program bus; the lower-third bus is the first independent auxiliary output.
- Remote operators provide focused control actions, not simultaneous collaborative scene editing or conflict resolution.
- Song, Scripture, and AI panels configure providers; provider-specific browsing/import and paid API calls still require adapters and valid subscriptions.
- The post-production editor currently provides trim/export rather than a multitrack timeline.
- Wireless receivers must support a browser or be connected through streaming software; native casting protocols are future extensions.
- Recording chunks are retained in memory before saving, so very long recordings should be split until direct-to-disk recording is added.

## Project Structure

- `electron/` — main process, FFmpeg services, outputs, storage, IPC, and hotkeys
- `electron/preload.ts` — secure renderer bridge
- `src/renderer/` — React production interface and capture pipeline
- `src/shared/` — shared types and IPC constants
- `src/services/` — service interfaces and extension points

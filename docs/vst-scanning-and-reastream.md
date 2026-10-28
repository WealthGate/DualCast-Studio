# VST scanning and ReaStream in v0.6.38

## Find and enable plugins

Open **Audio Mixer → VST audio plugin** in the Windows x64 desktop app.

1. Choose **Scan installed VST2 plugins**. The app searches `Program Files/VSTPlugins`, `Program Files/Steinberg/VstPlugins`, the Common Files VST2 folders, the Windows 64-bit VST registry locations, `VST_PATH`, and previously chosen folders.
2. For an installation elsewhere, choose **Scan folder…**. The selected folder is searched recursively and remembered for future installed-plugin scans. **Add VST2 .dll** still accepts a single file.
3. Select a discovered plugin and choose **Enable plugin**. Its native controls open automatically when it has an editor. Use **Open plugin controls** to reopen them.
4. Choose **Bypass plugin** to stop it and save its settings. Enable again after restarting the app. Only one plugin runs at a time. EQ and master volume follow the plugin.

Scans preserve existing registration IDs and presets and leave DLLs in their installed locations. They do not enable audio processing. Duplicate files are skipped. Invalid DLLs and failed probes appear under **Scan details**; one failure does not stop other files from being scanned. VST3 bundles are skipped. Scanning is bounded to 256 DLLs, 10,000 directory entries, 12 directory levels and two minutes of probing, with 10 seconds per probe and at most 64 registered plugins. The app reports when a limit is reached; select a smaller folder to continue. Up to 20 failure details are shown. Scans may execute third-party plugin initialization in an isolated helper.

## Receive ReaStream audio

Use the installed **64-bit ReaPlugs** VST2 DLL, commonly `C:\Program Files\VSTPlugins\ReaPlugs\reastream-standalone.dll`. The separate `reastream-standalone-4.dll` variant is also discovered; the host uses its first stereo output pair.

1. Scan or add the DLL, select **ReaStream (ReaPlugs Edition)** and choose **Enable plugin**.
2. In the controls, turn on **Enable audio/MIDI**, choose **Receive audio/MIDI**, and enter the same identifier as the sending ReaStream instance.
3. Configure the sending instance for the receiver's network address. Permit the OpenChurch audio host through Windows Firewall if prompted. Network routing and firewall settings must allow sender and receiver to communicate.
4. Play audio at the sender and check Program audio before broadcasting. The receiver continues processing silence when no microphone/source is active. EQ, master volume, Mute all, monitoring, recording and streaming apply to its output.

## If Enable is unavailable or fails

- **No plugin selected:** scan or add a DLL, then select it.
- **File missing:** the DLL was moved or removed. Scan its current folder or remove the stale entry and add the installed DLL again. Removing an entry leaves the plugin installation intact.
- **Audio host missing:** reinstall the latest Windows x64 app. Development checkouts must run `npm run prepare:audio-host`. Previously this condition incorrectly displayed only the generic Windows x64 requirement.
- **32-bit, VST3 or wrong architecture:** install/select the 64-bit Windows VST2 DLL. Native hosting on macOS/Linux is not included.
- **Dependency/load error:** retain the original installation folder and repair the plugin installation if needed. The app shows the native host's load error. A failed or stalled plugin is bypassed; Program source audio continues.

## Verification

`npm test` covers nested/overlapping scan roots, duplicate discovery, PE architecture validation, corrupt/truncated files and scan limits, together with the existing transport and audio tests.

`npm run verify:audio-plugin-ui` tests the actual React panel, production preload, isolated scanner, registry and native host using a disposable profile. It verifies scan/selection/enable/bypass, invalid DLL reporting, rescan deduplication and remembered custom folders. `node scripts/verify-audio-plugin-ui.cjs --installed` additionally exercises locally installed ReaStream, including automatic controls and returned native PCM blocks.

`node scripts/verify-audio-host.cjs --installed` checks real installed ReaEQ/ReaStream DLL loading and synthetic PCM processing. `npm run verify:audio-plugin-bridge` measures the actual AudioWorklet/preload/native PCM round trip, dry fallback after a crashed helper, silent-input generation, master/mute and preservation of the Program output track. Release CI runs the fixture UI and bridge checks on Windows before packaging.

These local checks do not establish that a particular live network sender, firewall or remote receiver is configured correctly. Rehearse using the actual sender and network.

# VST scanning and ReaStream

## VST validation fixes in v0.6.46

Plugin/dependency diagnostics can no longer enter the native PCM stream and cause a false **invalid audio** bypass. The host also accepts effects that finish initializing during Open and older VST2 effects using an accumulating float32 callback. Diagnostic text on stderr is bounded and ignored without corrupting plugin metadata. Probe exit handling waits for pending status output.

Scan details can still include DLLs that are support libraries rather than VST2 effects, 32-bit plugins, missing dependencies, or license/activation failures. These do not invalidate successfully registered effects. MIDI instruments such as UVI Workstation require MIDI input and are not supported in the Program audio effect slot; ReaStream is supported.

## Find and enable plugins

Open **Audio Mixer → VST audio plugin** in the Windows x64 desktop app.

1. Choose **Scan installed VST plugins**. The app searches the usual Windows VST2 paths, the Common Files and per-user VST3 folders, Windows VST registry locations, `VST_PATH`, and previously chosen folders.
2. Use **Scan folder…** for a custom folder or a `.vst3` bundle. **Add plugin file** accepts a standalone VST2 `.dll` or VST3 `.vst3` file.
3. Select the plugin and choose **Process Source Audio** to run an effect on the existing mix, or **Replace Source Audio** for a receiver or generator. Enable the plugin. If it has a native editor, the controls open automatically. Use **Open plugin controls** to reopen them.
4. Choose **Bypass plugin** to stop it and save its settings. Enable again after restarting the app. Only one plugin runs at a time. EQ and master volume follow the plugin.

Scans preserve registration IDs and presets. Failed probes appear under **Scan details**. Scanning is bounded to 256 candidates, 10,000 directory entries, 12 directory levels and two minutes of probing, with 10 seconds per probe and at most 64 registered plugins. Choose a smaller folder if the scan reaches a limit.

## Receive ReaStream audio

Use the installed **64-bit ReaPlugs** VST2 DLL, commonly `C:\Program Files\VSTPlugins\ReaPlugs\reastream-standalone.dll`. The separate `reastream-standalone-4.dll` variant is also discovered; the host uses its first stereo output pair.

1. Scan or add the DLL and select **ReaStream (ReaPlugs Edition)**. Choose **Replace Source Audio**, then **Enable plugin**.
2. In the controls, turn on **Enable audio/MIDI**, choose **Receive audio/MIDI**, and enter the same identifier as the sending ReaStream instance.
3. Configure the sending instance for the receiver's network address. Permit the OpenChurch audio host through Windows Firewall if prompted. Network routing and firewall settings must allow sender and receiver to communicate.
4. Play audio at the sender and check Program audio before broadcasting. The receiver gets a continuous stream of silent blocks. EQ, master volume, Mute all, monitoring, recording and streaming apply to its output. Replace mode stays silent when the plugin stops, misses a block or receives no audio. To resume local audio, bypass the plugin and choose **Process Source Audio**.

## If Enable is unavailable or fails

- **No plugin selected:** scan or add a DLL, then select it.
- **File missing:** the DLL was moved or removed. Scan its current folder or remove the stale entry and add the installed DLL again. Removing an entry leaves the plugin installation intact.
- **Audio host missing:** reinstall the latest Windows x64 app. Development checkouts must run `npm run prepare:audio-host`. Previously this condition incorrectly displayed only the generic Windows x64 requirement.
- **Wrong architecture:** install the Windows x64 effect. Native VST hosting is available in the Windows x64 desktop app.
- **Dependency/load error:** retain the original installation folder and repair the plugin installation if needed. The app shows the native host's load error. A failed or stalled plugin is bypassed; Program source audio continues.
- **Could not initialize / timeout:** check the plugin's license/activation manager and required dependencies, complete any plugin activation dialog, and retry. This describes an initialization failure rather than declaring the DLL invalid.
- **MIDI instrument:** choose an audio effect. This slot does not supply MIDI notes to instruments.
- **Failed while restoring saved settings:** the plugin crashed or stalled while loading its previous preset. Remove its entry and add the DLL again to create a fresh registration; the previous preset stays on disk. The installed ReaControlMIDI DLL reproduced this failure with its own saved chunk. ReaControlMIDI is intended for MIDI processing; use ReaStream to receive network audio.

The local installed-plugin audit also found initialization timeouts for Virtual Mix Rack and SSL DeEss. A timeout alone does not identify the cause; check the vendor's activation manager and installation. These third-party failures do not establish that their DLLs are invalid and do not stop other effects from being scanned.

## Verification

`npm test` covers nested/overlapping scan roots, duplicate discovery, PE architecture validation, corrupt/truncated files and scan limits, together with the existing transport and audio tests.

`npm run verify:audio-plugin-ui` tests the actual React panel, production preload, isolated scanner, registry and native host using a disposable profile. It verifies scan/selection/enable/bypass, invalid DLL reporting, rescan deduplication and remembered custom folders. `node scripts/verify-audio-plugin-ui.cjs --installed` additionally exercises locally installed ReaStream, including automatic controls and returned native PCM blocks.

`node scripts/verify-audio-host.cjs --installed` checks real installed ReaEQ/ReaStream DLL loading and synthetic PCM processing. `npm run verify:audio-plugin-bridge` measures the actual AudioWorklet/preload/native PCM round trip, dry fallback after a crashed helper, silent-input generation, master/mute and preservation of the Program output track. Release CI runs the fixture UI and bridge checks on Windows before packaging.

These local checks do not establish that a particular live network sender, firewall or remote receiver is configured correctly. Rehearse using the actual sender and network.

The native fixture also verifies third-party stdout isolation, unterminated diagnostic lines, late interface initialization, legacy float32 processing, and explicit initialization/instrument errors. The fixture UI check exercises a noisy legacy effect through the production scanner, preload and audio bridge.

# Streaming recovery and audio in 0.6.34

## Upload delivery

The previous FFmpeg FIFO deliberately discarded audio and dependent video packets when full, then waited for a video keyframe. Four isolated overflows in a real session were separated by minutes; recovery required two within 30 seconds, so that session never adapted its video bandwidth. The new bounded FIFO preserves packets and applies backpressure. The input queue and encoder-write deadlines request fresh capture when delivery cannot remain live. Short interruptions can drain normally; a sustained undersized uplink requires a reconnect and reduced video bandwidth.

On a healthy connection, the selected bitrate profile, frame rate and resolution remain unchanged. With automatic recovery enabled, congestion switches the streaming capture to low-bandwidth 720p, up to 30 FPS. Repeated failures can switch it to 15 FPS. A selected frame rate already below those limits is retained. Reduced settings remain in effect for that broadcast; starting a new broadcast uses the selected settings again. Program projection and recording dimensions are unchanged. Audio bitrate is unchanged. No finite queue can provide uninterrupted real-time video when upload capacity stays below the encoded data rate or the connection is unavailable.

The initial capture now seeds the video cadence, preventing two startup frames from sharing the same millisecond timestamp. FFmpeg stderr parsing retains incomplete lines across pipe reads so split congestion/error reports are recognized.

## Source audio and EQ

Microphone and desktop audio request 48 kHz stereo where available and explicitly disable automatic gain, noise suppression and echo cancellation. Mono/44.1 kHz devices remain usable; hardware and OS processing remain controlled by the device/OS. Broadcasting still uses the selected AAC bitrate required by RTMP ingest. No compressor or limiter is automatically applied.

Audio Mixer includes a three-band EQ: Bass at 180 Hz, Mid at 1 kHz and Treble at 6 kHz, each ±12 dB. It starts bypassed with all bands at zero. Reset returns all bands to neutral. Settings save locally. Source gain and EQ changes use short ramps. Source nodes remain connected while their stream identity is unchanged. A disconnected selected microphone is retried without repeatedly requesting denied permission.

## Local native plugins

Windows x64 supports one enabled VST2 effect at a time. Add its installed `.dll` from Audio Mixer. Files remain in their installed location because many plugins depend on adjacent files. Importing validates the DLL in a separate process; it does not enable the effect. Enable it and select Open plugin controls. Closing controls or bypassing saves the effect's preset locally. Native effects must be enabled again after restarting the app. Removing a registration leaves installed plugin files intact.

For ReaStream, use the standalone 64-bit ReaPlugs DLL, commonly `reastream-standalone.dll`. Enable it, open its controls and configure Receive with the matching identifier/sender. The plugin handles its own network protocol and permissions. Silent input is continuously supplied while enabled, so receiving audio does not require an active microphone. EQ, final master volume, stereo/mono mode, monitoring, recording and streaming all follow the insert. Mute all also mutes receiver/generated audio.

Third-party code runs in an isolated native process. Float32 stereo PCM moves in 512-frame blocks; queues are bounded. Audio never waits on IPC. A late block uses original samples at the same fixed deadline. Host crashes, invalid packets and processing timeouts bypass the plugin. Once initialized, the bridge keeps a fixed 2048-frame (42.7 ms) delay even in bypass, avoiding timing jumps on failures. Reported plugin lookahead is added to dry fallback and shown in the mixer; up to 8192 extra frames are supported. Changing a plugin's latency/layout live stops it safely and asks for reload after saving its settings. Delayed effects can change audio/video sync; use low-latency plugin settings for live speech.

Supported: Windows x64 VST2 float32 effects with mono/stereo or zero-input processing and native editors. Only the first stereo output pair is used; extra inputs receive silence. Unsupported: VST3 bundles, 32-bit DLLs, MIDI instruments and native plugins on macOS/Linux. Plugin CPU cost depends on the selected effect and preset. No plugins are bundled. Inactive plugins consume no helper process or PCM IPC; the small audio bridge and three native biquad filters avoid polling devices or running per-sample audio on the renderer thread.

## Verification

- Full unit suite includes streaming startup/shutdown, split errors, recovery profiles, microphone reconnection, EQ normalization, bounded native packet parsing, and fixed-delay wet/dry sample order.
- `npm run verify:audio-fidelity` uses real Chromium audio: transparent bypass, flat EQ, band response, stereo separation, stable source routes and receiver master/mute.
- `npm run verify:audio-host` builds an original native test effect and verifies float samples above unity, order, presets, silent-input generation, NaN handling, bounded packets, process crashes, and activated/stable latency. Add `-- --installed` to also process real locally installed ReaEQ/ReaStream when available.
- `npm run verify:audio-plugin-bridge` exercises production preload IPC and actual AudioWorklet/native processing, measures matching stereo PCM, kills that test's host, and verifies uninterrupted delayed dry audio plus receiver/master/mute and a stable output track.
- `node scripts/verify-stream-startup.cjs --encoder=x264 --ci --seconds=60 --upload-kbps=4500` verifies paced moving video through production service and real local RTMP, then decodes/counts video and audio and checks A/V timing.
- `node scripts/verify-stream-startup.cjs --encoder=x264 --ci --seconds=30 --upload-kbps=250 --expect-congestion` verifies a real undersized connection transfers media, then requests lower-bandwidth recovery without FIFO packet drops.

Local tests do not certify every external network, ingestion service, device driver, plugin or ReaStream sender/receiver installation. Check the destination's live health and audio meters during a rehearsal using the actual connection and devices.

Measured on the test PC: 60 seconds at 4.5 Mb/s delivered 1800/1800 video frames and 2814 AAC frames, with 29 ms final A/V drift and a 21 ms maximum audio packet gap. At 250 kb/s, 290944 bytes reached the local receiver before lower-bandwidth recovery was requested at 10.3 seconds, without FIFO packet drops. At 1.2 Mb/s, the 720p/15 low profile delivered 450/450 frames over 30 seconds with the 192 kb/s audio setting retained. The actual native bridge matched every measured stereo sample, retained the same delayed dry samples after a killed host, and produced no renderer errors. Real installed ReaEQ and ReaStream loaded and processed synthetic PCM; a live ReaStream network sender was not part of that check.

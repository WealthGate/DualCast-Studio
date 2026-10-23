# Native audio plug-in host

The current native host supports **64-bit Windows VST2 effect DLLs**. It does not load VST3 bundles, 32-bit DLLs, macOS/Linux plug-ins, or MIDI instruments. Use the standalone ReaPlugs edition of ReaStream rather than REAPER's internal effect DLL. Third-party effects are supplied and licensed by the user and are not bundled with OpenChurch.

Build with `node scripts/build-audio-host.cjs` on Windows with Visual Studio C++ x64 tools. The executable uses the static C++ runtime and is packaged in the Windows app under `resources/audio-host/`. The process owns the native editor and the effect; Electron never loads plug-in code. A faulty effect can terminate its own host process without terminating the studio.

The host receives `--plugin <absolute.dll>`, optional `--state <absolute-file>`, `--sample-rate 48000` and `--block-size 512`. `--probe` validates/identifies an effect and exits; run probes with a timeout. Normal audio processing waits for stdin and therefore consumes no processing CPU while the app supplies no audio. The app must continuously supply silence when no physical source is active so that network receivers such as ReaStream can generate sound.

stdin/stdout use a 16-byte little-endian header: `uint32 magic = 0x4f434156`, `uint32 type`, `uint32 requestId`, `uint32 payloadBytes`. Type 1 carries interleaved stereo float32 audio (1–8192 frames). Its stdout response preserves the request ID and payload size. Control packets have no payload: type 2 shows the native editor, type 3 saves state, type 4 saves and exits, type 5 sets bypass according to whether `requestId` is nonzero. stderr reports newline-separated JSON events (`ready`, `editor`, `saved`, `warning`, `error`). `ready` includes name, vendor, channel counts, parameter count, native editor availability and plug-in latency in frames.

Plug-in settings are saved atomically using its opaque preset chunk, with normalized parameters as a fallback. The binary state is tied to the effect's unique ID. Closing the editor saves settings. Sending save/quit or closing stdin also saves. The app should debounce saves while the editor is open and allow graceful shutdown before forcibly terminating a stuck effect. Retain the installed DLL's original location: dependent data/resources can be stored alongside it.

Audio processing uses preallocated planar buffers, supports mono/stereo and zero-input effects, leaves additional inputs silent, and returns only the first stereo output pair. Mono output is duplicated. Finite float samples retain their original amplitude; NaN/infinity output is replaced with silence. Denormal floats are disabled on the processing thread to avoid high CPU in long effect tails. The parent must bound in-flight audio requests, handle effect crashes/timeouts using its bypass path, and account for the reported effect latency.

Normal readiness reports latency after effect activation; up to 8192 frames are supported. A live change to the effect's channel layout or reported delay saves settings and stops processing so the parent can bypass safely. Reloading the effect applies its saved settings and reports the new delay before any audio is processed.

`node scripts/verify-audio-host.cjs` builds and tests an original deterministic effect. With `--installed`, it additionally checks locally installed ReaEQ and ReaStream if present. It does not install or modify any third-party effects and does not configure network senders/receivers. Passing these checks does not certify every third-party plug-in or a real network audio session.

Implementation sources are original. No VST2 SDK, OBS, JUCE or other third-party code is included. VST is a trademark of Steinberg Media Technologies GmbH.

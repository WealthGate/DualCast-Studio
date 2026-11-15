# Native audio plug-in host

The native host supports **Windows x64 VST2 and VST3 audio effects**. The scanner accepts both standalone `.vst3` files and `.vst3` folders with a Windows x64 module. Program uses the first supported VST3 audio effect in a module and the first two channels of its main output. VST instruments require MIDI hosting, which Program does not provide. ReaStream uses the standalone ReaPlugs DLL. Users install their effects separately.

Build with `node scripts/build-audio-host.cjs` on Windows with Visual Studio C++ x64 tools. The executable uses the static C++ runtime and is packaged in the Windows app under `resources/audio-host/`. The process owns the native editor and the effect; Electron never loads plug-in code. A faulty effect can terminate its own host process without terminating the studio.

The host receives `--plugin <absolute-module>`, optional `--state <absolute-file>`, `--sample-rate 48000` and `--block-size 512`. `--probe` validates and identifies an effect before exiting. Normal audio processing waits for stdin. In **Replace Source Audio**, the app continuously supplies silent audio blocks so receivers such as ReaStream can supply all Program audio.

stdin/stdout use a 16-byte little-endian header: `uint32 magic = 0x4f434156`, `uint32 type`, `uint32 requestId`, `uint32 payloadBytes`. Type 1 carries interleaved stereo float32 audio (1–8192 frames). Its stdout response preserves the request ID and payload size. Control packets have no payload: type 2 shows the native editor, type 3 saves state, type 4 saves and exits, type 5 sets bypass according to whether `requestId` is nonzero. stderr reports newline-separated JSON events (`ready`, `editor`, `saved`, `warning`, `error`). `ready` includes name, vendor, channel counts, parameter count, native editor availability and plug-in latency in frames.

Plug-in settings are saved atomically and tied to the effect's ID. VST2 uses its preset chunk or normalized parameters. VST3 saves component and controller state. Closing the editor, stopping the plug-in or closing stdin saves settings. Keep plug-ins in their installed locations so they can find dependencies and resources.

Audio processing uses preallocated planar buffers, supports mono/stereo and zero-input effects, leaves additional inputs silent, and returns only the first stereo output pair. Mono output is duplicated. Finite float samples retain their original amplitude; NaN/infinity output is replaced with silence. Denormal floats are disabled on the processing thread to avoid high CPU in long effect tails. The parent must bound in-flight audio requests, handle effect crashes/timeouts using its bypass path, and account for the reported effect latency.

The audio pipe is reserved before loading the DLL. Plugin stdout diagnostics are redirected away from PCM through both CRT and Win32 standard handles. Status events start on a new stderr line, and the parent bounds and ignores third-party diagnostic lines while preserving split UTF-8 metadata. Effect audio interfaces are validated after Open and audio-format setup. Both replacing and legacy accumulating float32 callbacks are supported; legacy outputs are cleared before each call. MIDI instruments are rejected with an explicit explanation.

Normal readiness reports latency after effect activation; up to 8192 frames are supported. A live change to the effect's channel layout or reported delay saves settings and stops processing so the parent can bypass safely. Reloading the effect applies its saved settings and reports the new delay before any audio is processed.

`node scripts/verify-audio-host.cjs` builds and tests deterministic VST2 and VST3 effects. With `--installed`, it checks locally installed ReaEQ and ReaStream if present. Rehearse network reception with the real sender on the production network.

`vendor/pluginterfaces` contains the required headers from Steinberg's [VST3 Plug-In Interfaces 3.8.0](https://github.com/steinbergmedia/vst3_pluginterfaces/tree/31d6eeba6daaa3e2a8bfbe3e7a90ca0b7fbfbc1c), distributed under the included MIT license. VST is a trademark of Steinberg Media Technologies GmbH.

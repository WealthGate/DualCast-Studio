import { ChildProcessByStdio, spawn, spawnSync } from "child_process";
import { Readable, Writable } from "stream";
import fs from "fs";
import path from "path";
import { app } from "electron";
import bundledFfmpegPath from "ffmpeg-static";
import log from "./logger";
import { resolveFfmpegExecutablePath } from "./ffmpegPathService";
import { supportsStreamResolution } from "./encoderResolution";
import {
  buildEncoderProbeArgs,
  probedStreamingEncoders,
  hasEncodedVideoFrame,
  isHardwareEncoderStartupFailure,
  mapStreamingEncoder,
  resolveStreamingEncoder
} from "./streamingEncoder";
import {
  StreamDestinationInput,
  StreamStartPayload,
  StreamStartResult,
  StreamStatusPayload,
  StreamStopResult,
  StreamingEncoder,
  StreamingStatus
} from "../../src/shared/types";
import { buildRecoverableRtmpOutputArgs } from "../../src/shared/streamingOutputs";
import { isValidRtmpUrl } from "../../src/shared/streamingValidation";
import { createMediaInputQueue } from "./mediaInputQueue";
import { resolutionSize } from "../../src/shared/recording";
import { streamingProfile } from "../../src/shared/streamingProfile";

type StatusPublisher = (payload: StreamStatusPayload) => void;

type DestinationRuntime = {
  steadySince: number | null;
  startupTimer?: NodeJS.Timeout;
  inputController?: AbortController;
  inputQueue?: ReturnType<typeof createMediaInputQueue>;
  destination: StreamDestinationInput;
  process: ChildProcessByStdio<Writable, null, Readable> | null;
  status: StreamingStatus;
  reconnectAttempt: number;
  reconnectTimer: NodeJS.Timeout | null;
  needsHeader: boolean;
  encoder: StreamingEncoder;
  encoderFallbackPending: boolean;
  lastError: string | null;
  stats: StreamStatusPayload["stats"];
};

const STOP_TIMEOUT_MS = 4000;
const STARTUP_TIMEOUT_MS = 10000;
const MAX_RECONNECT_ATTEMPTS = 5;
const ffmpegPath = resolveFfmpegExecutablePath(bundledFfmpegPath);

const runtimes = new Map<string, DestinationRuntime>();
const availableEncoders = new Set<StreamingEncoder>(["x264"]);
let statusPublisher: StatusPublisher | null = null;
let currentStatus: StreamStatusPayload = { status: "idle", message: null, startedAt: null };
let lastStartPayload: StreamStartPayload | null = null;
let stopRequested = false;
let startedAt: number | null = null;
let sessionLogPath: string | null = null;
let logStream: fs.WriteStream | null = null;
let cachedHeader: Buffer | null = null;
let vaapiDevice: string | null = null;
let restartRequired = false;
let reduceLoad = false;

const resolveVaapiDevice = () => {
  if (process.platform !== "linux") {
    return null;
  }
  try {
    return fs
      .readdirSync("/dev/dri")
      .filter((name) => /^renderD[0-9]+$/.test(name))
      .sort()
      .map((name) => path.join("/dev/dri", name))
      .find((devicePath) => {
        try {
          fs.accessSync(devicePath, fs.constants.R_OK | fs.constants.W_OK);
          return true;
        } catch {
          return false;
        }
      }) ?? null;
  } catch {
    return null;
  }
};

const createSessionLogPath = () => {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return path.join(app.getPath("userData"), "logs", `streaming-${stamp}.log`);
};

const ensureLogStream = () => {
  if (logStream) {
    return;
  }
  sessionLogPath = sessionLogPath ?? createSessionLogPath();
  fs.mkdirSync(path.dirname(sessionLogPath), { recursive: true });
  logStream = fs.createWriteStream(sessionLogPath, { flags: "a" });
  logStream.on("error", (error) => log.warn(`Streaming log unavailable: ${error.message}`));
};

const sanitizeLogLine = (line: string) => {
  let sanitized = line;
  runtimes.forEach(({ destination }) => {
    if (destination.streamKey) {
      sanitized = sanitized.split(destination.streamKey).join("***");
    }
    const endpoint = `${destination.rtmpUrl.replace(/\/+$/, "")}/${destination.streamKey}`;
    sanitized = sanitized.split(endpoint).join(`${destination.rtmpUrl.replace(/\/+$/, "")}/***`);
  });
  return sanitized;
};

const writeStreamLog = (destinationName: string, line: string) => {
  ensureLogStream();
  logStream?.write(`[${destinationName}] ${sanitizeLogLine(line)}\n`);
};

const parseStats = (line: string) => {
  const fpsMatch = line.match(/fps=\s*([0-9.]+)/);
  const bitrateMatch = line.match(/bitrate=\s*([0-9.]+)kbits\/s/);
  const timeMatch = line.match(/time=([0-9:.]+)/);
  const dropMatch = line.match(/drop=\s*([0-9]+)/);
  const speedMatch = line.match(/speed=\s*([0-9.]+)x/);

  if (!fpsMatch && !bitrateMatch && !timeMatch && !dropMatch) {
    return null;
  }

  return {
    fps: fpsMatch ? Number(fpsMatch[1]) : null,
    bitrateKbps: bitrateMatch ? Number(bitrateMatch[1]) : null,
    time: timeMatch ? timeMatch[1] : null,
    droppedFrames: dropMatch ? Number(dropMatch[1]) : null,
    speed: speedMatch ? Number(speedMatch[1]) : null
  };
};

const detectEncoders = () => {
  if (!ffmpegPath) {
    return;
  }
  try {
    const result = spawnSync(ffmpegPath, ["-hide_banner", "-encoders"], { encoding: "utf8" });
    const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
    if (output.includes("libx264")) availableEncoders.add("x264");
    vaapiDevice = resolveVaapiDevice();
    probedStreamingEncoders.forEach((encoder) => {
      const ffmpegEncoder = mapStreamingEncoder(encoder);
      if (!output.includes(ffmpegEncoder)) {
        return;
      }
      if (encoder === "vaapi" && !vaapiDevice) {
        return;
      }
      const probe = spawnSync(ffmpegPath, buildEncoderProbeArgs(encoder, { vaapiDevice }), {
        encoding: "utf8",
        timeout: 3000,
        windowsHide: true
      });
      if (probe.status === 0 && !probe.error) {
        availableEncoders.add(encoder);
      } else {
        log.info(`${ffmpegEncoder} is included in FFmpeg but unavailable on this PC; streaming will use a compatible encoder.`);
      }
    });
  } catch {
    // x264 remains the safe fallback.
  }
};

export const buildFfmpegArgs = (payload: StreamStartPayload, encoder: StreamingEncoder) => {
  const profile = streamingProfile(payload.preset, payload.resolution, payload.fps);
  const preset = { maxWidth: profile.width, videoBitrateKbps: profile.videoBitsPerSecond / 1000 };
  const copyVideo = payload.copyVideo === true && payload.inputVideoCodec === "h264";
  const gop = payload.fps * 2;
  const bitrate = `${preset.videoBitrateKbps}k`;
  const args = [
    "-hide_banner",
    "-loglevel",
    "info",
    "-filter_threads", "1",
    "-filter_complex_threads", "1",
    "-threads", "2",
    "-fflags",
    "genpts",
    "-flags",
    "low_delay",
    "-max_delay",
    "0",
    "-probesize", "262144",
    "-analyzeduration", "500000"
  ];

  if (encoder === "vaapi" && vaapiDevice) {
    args.push("-vaapi_device", vaapiDevice);
  }

  args.push("-i", "pipe:0", "-map", "0:v:0");
  if (copyVideo) args.push("-c:v", "copy", "-copytb", "1");
  else {
    args.push(
      "-vf",
      encoder === "vaapi"
        ? `scale='min(${preset.maxWidth},iw)':-2,format=nv12,hwupload`
        : encoder === "mediafoundation" || encoder === "qsv"
          ? `scale='min(${preset.maxWidth},iw)':-2,format=nv12`
          : `scale='min(${preset.maxWidth},iw)':-2`,
      "-r",
      String(payload.fps),
      "-c:v",
      mapStreamingEncoder(encoder),
      "-flags:v", "+global_header",
      "-threads", "2"
    );

    if (encoder === "x264") {
      args.push("-preset", "superfast", "-tune", "zerolatency");
    } else if (encoder === "nvenc") {
      args.push("-preset", "p4", "-tune", "ll");
    } else if (encoder === "qsv") {
      args.push("-preset", "veryfast", "-async_depth", "1", "-look_ahead", "0");
    } else if (encoder === "videotoolbox") {
      args.push("-realtime", "1");
    } else if (encoder === "mediafoundation") {
      args.push("-hw_encoding", "1", "-scenario", "live_streaming", "-rate_control", "cbr");
    }

    args.push(
      "-b:v",
      bitrate,
      "-maxrate",
      bitrate,
      "-bufsize",
      `${preset.videoBitrateKbps * 2}k`
    );

    if (encoder !== "vaapi" && encoder !== "mediafoundation" && encoder !== "qsv") {
      args.push("-pix_fmt", "yuv420p");
    }

    args.push(
      "-g",
      String(gop),
      "-keyint_min",
      String(gop)
    );

    if (encoder === "x264") {
      args.push("-sc_threshold", "0");
    }
    args.push("-bf", "0");
    if (encoder === "x264") args.push("-minrate", bitrate, "-x264-params", "nal-hrd=cbr:force-cfr=1");
  }

  if (payload.hasAudio) {
    args.push("-map", "0:a:0", "-c:a", "aac", "-b:a", `${payload.audioBitrate}k`, "-ar", "48000");
  } else {
    args.push("-an");
  }

  // Bound audio buffering if a source temporarily stops supplying pictures.
  args.push("-max_interleave_delta", "250000", "-flush_packets", "1");
  return args;
};

const publishAggregateStatus = () => {
  const entries = Array.from(runtimes.values());
  if (entries.length === 0) {
    currentStatus = {
      status: "idle",
      message: null,
      startedAt: null,
      logPath: sessionLogPath,
      destinationStatuses: []
    };
    statusPublisher?.(currentStatus);
    return;
  }

  const liveCount = entries.filter((entry) => entry.status === "live").length;
  const connectingCount = entries.filter((entry) => entry.status === "connecting").length;
  const reconnectingCount = entries.filter((entry) => entry.status === "reconnecting").length;
  const errorCount = entries.filter((entry) => entry.status === "error").length;

  let status: StreamingStatus = "connecting";
  if (liveCount > 0) status = "live";
  else if (reconnectingCount > 0) status = "reconnecting";
  else if (connectingCount > 0) status = "connecting";
  else if (errorCount === entries.length) status = "error";

  const message =
    entries.length > 1
      ? `${liveCount}/${entries.length} destinations live${errorCount ? `, ${errorCount} failed` : ""}`
      : entries[0].lastError;
  const stats = entries.find((entry) => entry.status === "live")?.stats ?? entries[0].stats ?? null;

  currentStatus = {
    reduceLoad,
    restartRequired,
    status,
    message,
    startedAt: status === "live" ? startedAt : null,
    logPath: sessionLogPath,
    stats,
    reconnectAttempt: Math.max(...entries.map((entry) => entry.reconnectAttempt)),
    reconnectMax: MAX_RECONNECT_ATTEMPTS,
    lastError: entries.find((entry) => entry.lastError)?.lastError ?? null,
    destinationStatuses: entries.map((entry) => ({
      id: entry.destination.id,
      name: entry.destination.name,
      status: entry.status,
      message: entry.lastError,
      reconnectAttempt: entry.reconnectAttempt
    }))
  };
  statusPublisher?.(currentStatus);
};

const requestFreshInput = (reason: string, lowerBandwidth = false) => {
  if (stopRequested || restartRequired || lastStartPayload?.autoRecover !== true) return false;
  restartRequired = true;
  reduceLoad = lowerBandwidth;
  runtimes.forEach(runtime => {
    const child = runtime.process; runtime.process = null;
    clearTimeout(runtime.startupTimer); runtime.inputQueue?.stop(); runtime.inputController?.abort();
    child?.kill("SIGKILL");
    runtime.status = "reconnecting";
    runtime.lastError = `${reason} Reconnecting with fresh video input.`;
    writeStreamLog(runtime.destination.name, runtime.lastError);
  });
  publishAggregateStatus();
  return true;
};

const startDestination = (runtime: DestinationRuntime, isReconnect: boolean) => {
  if (!ffmpegPath || !lastStartPayload) {
    runtime.status = "error";
    runtime.lastError = "FFmpeg is unavailable.";
    publishAggregateStatus();
    return;
  }

  const encoder = runtime.encoder;
  const endpoint = `${runtime.destination.rtmpUrl.replace(/\/+$/, "")}/${runtime.destination.streamKey}`;
  const args = buildFfmpegArgs(lastStartPayload, encoder);
  args.push(...buildRecoverableRtmpOutputArgs(endpoint, lastStartPayload.fps));

  runtime.status = isReconnect ? "reconnecting" : "connecting";
  runtime.needsHeader = true;
  runtime.encoderFallbackPending = false;
  runtime.lastError = null;
  runtime.steadySince = null;
  publishAggregateStatus();

  const process = spawn(ffmpegPath, args, {
    stdio: ["pipe", "ignore", "pipe"],
    windowsHide: true
  });
  runtime.process = process;
  const controller = new AbortController();
  runtime.inputController?.abort();
  runtime.inputController = controller;
  clearTimeout(runtime.startupTimer);
  runtime.startupTimer = setTimeout(() => {
    if (stopRequested || runtime.process !== process || runtime.steadySince !== null) return;
    if (requestFreshInput("Streaming startup did not sustain video.")) return;
    runtime.lastError = "Streaming startup timed out before video delivery became sustained. Try Software x264 or another detected encoder, and check the stream connection.";
    runtime.status = "error";
    runtime.inputQueue?.stop(); controller.abort(); process.kill("SIGINT");
    writeStreamLog(runtime.destination.name, runtime.lastError); publishAggregateStatus();
  }, STARTUP_TIMEOUT_MS);
  runtime.inputQueue?.stop();
  const write = (data: Buffer) => writeToInput(process.stdin, data, () => runtime.steadySince, controller.signal);
  runtime.inputQueue = createMediaInputQueue(async chunk => {
    if (runtime.process !== process) return;
    if (runtime.needsHeader && cachedHeader) {
      await write(cachedHeader);
      runtime.needsHeader = false;
      if (chunk.equals(cachedHeader)) return;
    }
    if (runtime.process === process) await write(chunk);
  }, error => {
    if (stopRequested || runtime.process !== process) return;
    if (requestFreshInput(error.message, true)) return;
    runtime.lastError = error.message;
    runtime.status = "error";
    process.stdin.destroy();
    process.kill("SIGINT");
    writeStreamLog(runtime.destination.name, error.message);
    publishAggregateStatus();
  }, Math.max(4 * 1024 * 1024, resolutionSize(lastStartPayload.resolution).width * resolutionSize(lastStartPayload.resolution).height / (1920 * 1080) * 4 * 1024 * 1024), { timeoutMs: STARTUP_TIMEOUT_MS, liveSince: () => runtime.steadySince });
  // A failed write also emits an asynchronous stream error, even when the
  // write callback handles it. Keep this listener through process shutdown.
  process.stdin.on("error", (error: Error) => {
    if (stopRequested || runtime.process !== process) return;
    runtime.lastError = sanitizeLogLine(error.message);
    writeStreamLog(runtime.destination.name, `Stream input closed: ${runtime.lastError}`);
    publishAggregateStatus();
  });
  writeStreamLog(runtime.destination.name, `Starting FFmpeg with ${lastStartPayload.copyVideo && lastStartPayload.inputVideoCodec === "h264" ? "H.264 video passthrough" : mapStreamingEncoder(encoder)}.`);

  process.stderr.setEncoding("utf8");
  let stderrRemainder = "";
  process.stderr.on("data", (chunk: string) => {
    if (stopRequested || runtime.process !== process) return;
    const lines = `${stderrRemainder}${chunk}`.split(/[\r\n]+/);
    stderrRemainder = lines.pop() ?? "";
    lines
      .filter(Boolean)
      .forEach((line) => {
        if (runtime.process !== process || stopRequested) return;
        writeStreamLog(runtime.destination.name, line);
        const stats = parseStats(line);
        if (stats) {
          runtime.stats = stats;
        }
        if (line.toLowerCase().includes("error") || line.toLowerCase().includes("failed")) {
          runtime.lastError = sanitizeLogLine(line.trim());
        }
        if (/FIFO queue full|queue overflow/i.test(line)) {
          // Treat any dropped-output report as actionable, even if isolated
          // by minutes. Requiring two within 30 seconds missed the real uplink
          // failures and left operators streaming at the same excessive rate.
          runtime.lastError = "The upload connection cannot sustain the current video bitrate.";
          if (requestFreshInput(runtime.lastError, true)) return;
        }
        if (isHardwareEncoderStartupFailure(runtime.encoder, line)) {
          runtime.encoderFallbackPending = true;
        }
        const encodedFrames = Number(/frame=\s*(\d+)/.exec(line)?.[1] ?? 0);
        // Stream copy reports output time without an encoded-frame counter.
        const outputTime = stats?.time?.split(":").reduce((seconds, part) => seconds * 60 + Number(part), 0) ?? 0;
        const copiedVideoProgress = lastStartPayload?.copyVideo === true && lastStartPayload.inputVideoCodec === "h264" && outputTime >= 1;
        if (runtime.steadySince === null && (encodedFrames >= (lastStartPayload?.fps ?? 30) || copiedVideoProgress)) {
          runtime.steadySince = Date.now();
          clearTimeout(runtime.startupTimer);
        }
        if (
          (runtime.status === "connecting" || runtime.status === "reconnecting") &&
          (hasEncodedVideoFrame(line) || copiedVideoProgress) && runtime.steadySince !== null
        ) {
          runtime.status = "live";
          runtime.reconnectAttempt = 0;
          runtime.lastError = null;
          startedAt = startedAt ?? Date.now();
        }
        publishAggregateStatus();
      });
  });

  process.on("error", (error: NodeJS.ErrnoException) => {
    if (stopRequested || runtime.process !== process) return;
    runtime.lastError = error.message;
    runtime.status = "error";
    if (error.code === "ENOENT" || error.code === "EACCES") {
      runtime.reconnectAttempt = MAX_RECONNECT_ATTEMPTS;
    }
    writeStreamLog(runtime.destination.name, `ffmpeg spawn error: ${error.message}`);
    publishAggregateStatus();
  });

  process.on("close", (code, signal) => {
    if (runtime.process !== process) return;
    clearTimeout(runtime.startupTimer);
    runtime.inputQueue?.stop(); controller.abort();
    runtime.process = null;
    if (stopRequested) {
      return;
    }
    runtime.lastError =
      runtime.lastError ?? `FFmpeg exited (code ${code ?? "?"}, signal ${signal ?? "?"}).`;
    log.warn(`${runtime.destination.name} stopped unexpectedly.`);
    if (runtime.encoderFallbackPending && runtime.encoder !== "x264" && lastStartPayload?.resolution !== "8k") {
      const failedEncoder = runtime.encoder;
      availableEncoders.delete(failedEncoder);
      runtime.encoder = resolveStreamingEncoder("auto", availableEncoders);
      runtime.encoderFallbackPending = false;
      runtime.reconnectAttempt = 0;
      runtime.status = "reconnecting";
      runtime.lastError = `${mapStreamingEncoder(failedEncoder)} is unavailable on this PC. Retrying with ${mapStreamingEncoder(runtime.encoder)}.`;
      writeStreamLog(runtime.destination.name, runtime.lastError);
      if (requestFreshInput(runtime.lastError)) return;
      // A new decoder cannot join dependent WebM chunks using only the first
      // cached batch. A manual restart must also create a fresh capture.
      runtime.status = "error";
      runtime.lastError += " Stop and start streaming to use a fresh video input.";
      publishAggregateStatus();
      return;
    }
    if (!/unauthorized|forbidden|invalid.*(?:key|token)|authentication|permission denied/i.test(runtime.lastError) && requestFreshInput("The stream encoder disconnected.")) return;
    runtime.status = "error";
    runtime.reconnectAttempt = MAX_RECONNECT_ATTEMPTS;
    runtime.lastError = `${runtime.lastError ?? "The stream output stopped."} Automatic network recovery ended; stop and start streaming to create a fresh media input.`;
    writeStreamLog(runtime.destination.name, runtime.lastError);
    publishAggregateStatus();
  });
};

const normalizeDestinations = (payload: StreamStartPayload): StreamDestinationInput[] => {
  if (payload.destinations?.length) {
    return payload.destinations.filter((destination) => destination.enabled);
  }
  if (payload.rtmpUrl && payload.streamKey) {
    return [
      {
        id: "primary",
        name: "Primary Stream",
        rtmpUrl: payload.rtmpUrl,
        streamKey: payload.streamKey,
        enabled: true
      }
    ];
  }
  return [];
};

export const setStreamStatusPublisher = (publisher: StatusPublisher) => {
  statusPublisher = publisher;
  publisher(currentStatus);
};

export const getStreamLogPath = () => sessionLogPath;

export const getStreamLogContent = async (payload?: { maxLines?: number }) => {
  if (!sessionLogPath) {
    return "";
  }
  try {
    const maxLines = Math.max(50, Math.min(2000, payload?.maxLines ?? 400));
    const content = await fs.promises.readFile(sessionLogPath, "utf8");
    return content.split(/\r?\n/).filter(Boolean).slice(-maxLines).join("\n");
  } catch {
    return "";
  }
};

export const getStreamingCapabilities = () => ({
  encoders: Array.from(availableEncoders)
});

export const startStreaming = async (payload: StreamStartPayload): Promise<StreamStartResult> => {
  if (runtimes.size > 0) {
    return { ok: false, message: "Streaming is already active." };
  }
  if (!ffmpegPath) {
    return { ok: false, message: "FFmpeg is missing from the application resources. Reinstall or update OpenChurch Broadcast Studio." };
  }

  const destinations = normalizeDestinations(payload);
  if (destinations.length === 0) {
    return { ok: false, message: "Enable at least one stream destination." };
  }
  if (destinations.length > 12) {
    return { ok: false, message: "A maximum of 12 simultaneous stream destinations is supported." };
  }
  if (new Set(destinations.map((destination) => destination.id)).size !== destinations.length) {
    return { ok: false, message: "Each stream destination must have a unique ID." };
  }
  if (!["low", "medium", "high"].includes(payload.preset) || ![15, 24, 25, 30, 50, 60].includes(payload.fps) || ![128, 192].includes(payload.audioBitrate)) {
    return { ok: false, message: "The selected streaming quality settings are invalid." };
  }
  const invalid = destinations.find(
    (destination) => !destination.streamKey || !isValidRtmpUrl(destination.rtmpUrl)
  );
  if (invalid) {
    return { ok: false, message: `Check the RTMP URL and stream key for ${invalid.name}.` };
  }

  if (payload.resolution === "8k") {
    const encoder = resolveStreamingEncoder(payload.encoder, availableEncoders);
    if (encoder === "x264" && payload.encoder !== "x264") {
      return { ok: false, message: "8K streaming has no usable hardware encoder on this device. Choose a lower resolution or explicitly select Software x264 if the CPU can sustain it." };
    }
    if (!await supportsStreamResolution(ffmpegPath, encoder, payload.fps, vaapiDevice)) {
      return { ok: false, message: `${mapStreamingEncoder(encoder)} cannot encode 8K with this driver/runtime. Choose another detected encoder or a lower stream resolution.` };
    }
    if (runtimes.size > 0) return { ok: false, message: "Streaming is already active." };
  }

  stopRequested = false;
  restartRequired = false;
  reduceLoad = false;
  startedAt = null;
  cachedHeader = null;
  sessionLogPath = createSessionLogPath();
  logStream = null;
  lastStartPayload = payload;

  destinations.forEach((destination) => {
    const encoder = resolveStreamingEncoder(payload.encoder, availableEncoders);
    const runtime: DestinationRuntime = {
      steadySince: null,
      destination,
      process: null,
      status: "connecting",
      reconnectAttempt: 0,
      reconnectTimer: null,
      needsHeader: true,
      encoder,
      encoderFallbackPending: false,
      lastError: null,
      stats: null
    };
    runtimes.set(destination.id, runtime);
    startDestination(runtime, false);
  });

  log.info(`Streaming started for ${destinations.length} destination(s).`);
  return { ok: true };
};

const writeToInput = (input: Writable, data: Buffer, liveSince: () => number | null, signal: AbortSignal) => new Promise<void>((resolve, reject) => {
  const began = Date.now();
  let settled = false;
  const finish = (error?: Error | null) => {
    if (settled) return;
    settled = true;
    clearTimeout(timeout); signal.removeEventListener("abort", cancel);
    if (error) reject(error); else resolve();
  };
  const cancel = () => { const error = new Error("Streaming stopped."); input.destroy(); finish(error); };
  const monitor = () => {
    const steady = liveSince();
    const remaining = (steady === null ? STARTUP_TIMEOUT_MS : 1500) - (Date.now() - Math.max(began, steady ?? 0));
    if (remaining > 0) { timeout = setTimeout(monitor, Math.min(250, remaining)); timeout.unref(); return; }
    const error = new Error(steady === null ? "Stream encoder startup stalled. Try another encoder or check the stream connection." : "Stream encoder input stalled. Lower streaming quality or reduce destinations and restart.");
    input.destroy(error);
    finish(error);
  };
  let timeout = setTimeout(monitor, 250);
  timeout.unref();
  if (signal.aborted) { cancel(); return; }
  signal.addEventListener("abort", cancel, { once: true });
  try {
    input.write(data, finish);
  } catch (error) {
    finish(error instanceof Error ? error : new Error(String(error)));
  }
});

export const sendStreamChunk = async (payload: Uint8Array) => {
  if (stopRequested || restartRequired || !payload?.length) {
    return;
  }
  const chunk = Buffer.from(payload);
  cachedHeader = cachedHeader ?? chunk;

  runtimes.forEach(runtime => {
    const input = runtime.process?.stdin;
    if (input?.writable && !input.destroyed && !input.writableEnded) runtime.inputQueue?.enqueue(chunk);
  });
};

export const stopStreaming = async (): Promise<StreamStopResult> => {
  if (runtimes.size === 0) {
    return { ok: false, message: "No active stream to stop." };
  }

  const failure = currentStatus.status === "error" ? currentStatus : null;
  stopRequested = true;
  runtimes.forEach(runtime => {
    clearTimeout(runtime.startupTimer);
    if (runtime.steadySince === null || failure) { runtime.inputQueue?.stop(); runtime.inputController?.abort(); }
  });
  await Promise.all(Array.from(runtimes.values()).map(runtime => runtime.inputQueue?.drain()));
  runtimes.forEach((runtime) => {
    runtime.inputQueue?.stop();
    if (runtime.reconnectTimer) {
      clearTimeout(runtime.reconnectTimer);
      runtime.reconnectTimer = null;
    }
    const process = runtime.process;
    runtime.process = null;
    if (!process) {
      return;
    }
    try {
      process.stdin.end();
    } catch {
      // Process may already be closing.
    }
    // Let EOF drain buffered media and finalize the output before forcing exit.
    const timeout = setTimeout(() => {
      if (process.exitCode === null && process.signalCode === null) {
        process.kill("SIGKILL");
      }
    }, STOP_TIMEOUT_MS);
    timeout.unref();
    process.once("close", () => clearTimeout(timeout));
  });

  runtimes.clear();
  restartRequired = false;
  cachedHeader = null;
  startedAt = null;
  lastStartPayload = null;
  logStream?.end();
  logStream = null;
  if (failure) { currentStatus = { ...failure, startedAt: null }; statusPublisher?.(currentStatus); }
  else publishAggregateStatus();
  log.info("Streaming stop requested for all destinations.");
  return { ok: true };
};

export const forceStopStreaming = () => {
  restartRequired = false;
  stopRequested = true;
  runtimes.forEach((runtime) => {
    clearTimeout(runtime.startupTimer);
    runtime.inputController?.abort();
    runtime.inputQueue?.stop();
    if (runtime.reconnectTimer) clearTimeout(runtime.reconnectTimer);
    runtime.reconnectTimer = null;
    const process = runtime.process;
    runtime.process = null;
    try {
      process?.kill("SIGKILL");
    } catch {
      // The process may already have exited.
    }
  });
  runtimes.clear();
  cachedHeader = null;
  startedAt = null;
  lastStartPayload = null;
  logStream?.end();
  logStream = null;
};

detectEncoders();

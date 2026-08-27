import { ChildProcessByStdio, spawn, spawnSync } from "child_process";
import { Readable, Writable } from "stream";
import fs from "fs";
import path from "path";
import { app } from "electron";
import bundledFfmpegPath from "ffmpeg-static";
import log from "./logger";
import { resolveFfmpegExecutablePath } from "./ffmpegPathService";
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
  StreamingPreset,
  StreamingStatus
} from "../../src/shared/types";
import { buildRecoverableRtmpOutputArgs } from "../../src/shared/streamingOutputs";

type StatusPublisher = (payload: StreamStatusPayload) => void;

type DestinationRuntime = {
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
const MAX_RECONNECT_ATTEMPTS = 5;
const ffmpegPath = resolveFfmpegExecutablePath(bundledFfmpegPath);

const presetConfig: Record<StreamingPreset, { maxWidth: number; videoBitrateKbps: number }> = {
  low: { maxWidth: 1280, videoBitrateKbps: 2500 },
  medium: { maxWidth: 1920, videoBitrateKbps: 4500 },
  high: { maxWidth: 1920, videoBitrateKbps: 6500 }
};

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

const isValidRtmpUrl = (rtmpUrl: string) => {
  try {
    const parsed = new URL(rtmpUrl);
    return parsed.protocol === "rtmp:" || parsed.protocol === "rtmps:";
  } catch {
    return false;
  }
};

const parseStats = (line: string) => {
  const fpsMatch = line.match(/fps=\s*([0-9.]+)/);
  const bitrateMatch = line.match(/bitrate=\s*([0-9.]+)kbits\/s/);
  const timeMatch = line.match(/time=([0-9:.]+)/);
  const dropMatch = line.match(/drop=\s*([0-9]+)/);

  if (!fpsMatch && !bitrateMatch && !timeMatch && !dropMatch) {
    return null;
  }

  return {
    fps: fpsMatch ? Number(fpsMatch[1]) : null,
    bitrateKbps: bitrateMatch ? Number(bitrateMatch[1]) : null,
    time: timeMatch ? timeMatch[1] : null,
    droppedFrames: dropMatch ? Number(dropMatch[1]) : null
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

const buildFfmpegArgs = (payload: StreamStartPayload, encoder: StreamingEncoder) => {
  const preset = presetConfig[payload.preset];
  const gop = payload.fps * 2;
  const bitrate = `${preset.videoBitrateKbps}k`;
  const args = [
    "-hide_banner",
    "-loglevel",
    "info",
    "-fflags",
    "nobuffer",
    "-flags",
    "low_delay",
    "-max_delay",
    "0"
  ];

  if (encoder === "vaapi" && vaapiDevice) {
    args.push("-vaapi_device", vaapiDevice);
  }

  args.push(
    "-i",
    "pipe:0",
    "-map",
    "0:v:0",
    "-vf",
    encoder === "vaapi"
      ? `scale='min(${preset.maxWidth},iw)':-2,format=nv12,hwupload`
      : encoder === "mediafoundation"
        ? `scale='min(${preset.maxWidth},iw)':-2,format=nv12`
        : `scale='min(${preset.maxWidth},iw)':-2`,
    "-r",
    String(payload.fps),
    "-c:v",
    mapStreamingEncoder(encoder)
  );

  if (encoder === "x264") {
    args.push("-preset", "veryfast", "-tune", "zerolatency");
  } else if (encoder === "nvenc") {
    args.push("-preset", "p4", "-tune", "ll");
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

  if (encoder !== "vaapi" && encoder !== "mediafoundation") {
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
  } else if (encoder === "vaapi") {
    args.push("-bf", "0");
  }

  if (payload.hasAudio) {
    args.push("-map", "0:a:0?", "-c:a", "aac", "-b:a", `${payload.audioBitrate}k`, "-ar", "44100");
  } else {
    args.push("-an");
  }

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
  args.push(...buildRecoverableRtmpOutputArgs(endpoint));

  runtime.status = isReconnect ? "reconnecting" : "connecting";
  runtime.needsHeader = true;
  runtime.encoderFallbackPending = false;
  runtime.lastError = null;
  publishAggregateStatus();

  const process = spawn(ffmpegPath, args, {
    stdio: ["pipe", "ignore", "pipe"],
    windowsHide: true
  });
  runtime.process = process;
  writeStreamLog(runtime.destination.name, `Starting FFmpeg with ${mapStreamingEncoder(encoder)}.`);

  process.stderr.setEncoding("utf8");
  process.stderr.on("data", (chunk: string) => {
    chunk
      .split(/\r?\n/)
      .filter(Boolean)
      .forEach((line) => {
        writeStreamLog(runtime.destination.name, line);
        const stats = parseStats(line);
        if (stats) {
          runtime.stats = stats;
        }
        if (line.toLowerCase().includes("error") || line.toLowerCase().includes("failed")) {
          runtime.lastError = sanitizeLogLine(line.trim());
        }
        if (isHardwareEncoderStartupFailure(runtime.encoder, line)) {
          runtime.encoderFallbackPending = true;
        }
        if (
          (runtime.status === "connecting" || runtime.status === "reconnecting") &&
          hasEncodedVideoFrame(line)
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
    runtime.lastError = error.message;
    runtime.status = "error";
    if (error.code === "ENOENT" || error.code === "EACCES") {
      runtime.reconnectAttempt = MAX_RECONNECT_ATTEMPTS;
    }
    writeStreamLog(runtime.destination.name, `ffmpeg spawn error: ${error.message}`);
    publishAggregateStatus();
  });

  process.on("close", (code, signal) => {
    runtime.process = null;
    if (stopRequested) {
      return;
    }
    runtime.lastError =
      runtime.lastError ?? `FFmpeg exited (code ${code ?? "?"}, signal ${signal ?? "?"}).`;
    log.warn(`${runtime.destination.name} stopped unexpectedly.`);
    if (runtime.encoderFallbackPending && runtime.encoder !== "x264") {
      const failedEncoder = runtime.encoder;
      availableEncoders.delete(failedEncoder);
      runtime.encoder = resolveStreamingEncoder("auto", availableEncoders);
      runtime.encoderFallbackPending = false;
      runtime.reconnectAttempt = 0;
      runtime.status = "reconnecting";
      runtime.lastError = `${mapStreamingEncoder(failedEncoder)} is unavailable on this PC. Retrying with ${mapStreamingEncoder(runtime.encoder)}.`;
      writeStreamLog(runtime.destination.name, runtime.lastError);
      publishAggregateStatus();
      startDestination(runtime, true);
      return;
    }
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

export const getStreamingStatus = () => currentStatus;

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
  if (!presetConfig[payload.preset] || ![15, 24, 25, 30, 50, 60].includes(payload.fps) || ![128, 192].includes(payload.audioBitrate)) {
    return { ok: false, message: "The selected streaming quality settings are invalid." };
  }
  const invalid = destinations.find(
    (destination) => !destination.streamKey || !isValidRtmpUrl(destination.rtmpUrl)
  );
  if (invalid) {
    return { ok: false, message: `Check the RTMP URL and stream key for ${invalid.name}.` };
  }

  stopRequested = false;
  startedAt = null;
  cachedHeader = null;
  sessionLogPath = createSessionLogPath();
  logStream = null;
  lastStartPayload = payload;

  destinations.forEach((destination) => {
    const encoder = resolveStreamingEncoder(payload.encoder, availableEncoders);
    const runtime: DestinationRuntime = {
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

const writeToInput = (input: Writable, data: Buffer) => new Promise<void>((resolve, reject) => {
  try {
    input.write(data, (error) => error ? reject(error) : resolve());
  } catch (error) {
    reject(error);
  }
});

export const sendStreamChunk = async (payload: Uint8Array) => {
  if (!payload?.length) {
    return;
  }
  const chunk = Buffer.from(payload);
  cachedHeader = cachedHeader ?? chunk;

  await Promise.all(Array.from(runtimes.values()).map(async (runtime) => {
    const stdin = runtime.process?.stdin;
    if (!stdin?.writable) {
      return;
    }
    try {
      if (runtime.needsHeader && cachedHeader) {
        await writeToInput(stdin, cachedHeader);
        runtime.needsHeader = false;
        if (chunk.equals(cachedHeader)) {
          return;
        }
      }
      await writeToInput(stdin, chunk);
    } catch (error) {
      runtime.lastError = (error as Error).message;
      writeStreamLog(runtime.destination.name, `stdin write failed: ${runtime.lastError}`);
      publishAggregateStatus();
    }
  }));
};

export const stopStreaming = async (): Promise<StreamStopResult> => {
  if (runtimes.size === 0) {
    return { ok: false, message: "No active stream to stop." };
  }

  stopRequested = true;
  runtimes.forEach((runtime) => {
    if (runtime.reconnectTimer) {
      clearTimeout(runtime.reconnectTimer);
      runtime.reconnectTimer = null;
    }
    const process = runtime.process;
    if (!process) {
      return;
    }
    try {
      process.stdin.end();
    } catch {
      // Process may already be closing.
    }
    process.kill("SIGINT");
    setTimeout(() => {
      if (process.exitCode === null) {
        process.kill("SIGKILL");
      }
    }, STOP_TIMEOUT_MS);
  });

  runtimes.clear();
  cachedHeader = null;
  startedAt = null;
  lastStartPayload = null;
  logStream?.end();
  logStream = null;
  publishAggregateStatus();
  log.info("Streaming stop requested for all destinations.");
  return { ok: true };
};

export const forceStopStreaming = () => {
  stopRequested = true;
  runtimes.forEach((runtime) => {
    if (runtime.reconnectTimer) clearTimeout(runtime.reconnectTimer);
    runtime.reconnectTimer = null;
    try {
      runtime.process?.kill("SIGKILL");
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

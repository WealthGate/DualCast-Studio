import { ChildProcessWithoutNullStreams, spawn, spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { app } from "electron";
import ffmpegPath from "ffmpeg-static";
import log from "./logger";
import {
  StreamStartPayload,
  StreamStartResult,
  StreamStatusPayload,
  StreamStopResult,
  StreamingEncoder,
  StreamingPreset
} from "../../src/shared/types";

type StatusPublisher = (payload: StreamStatusPayload) => void;

const STOP_TIMEOUT_MS = 4000;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_DELAYS_MS = [2000, 5000, 10000, 20000, 30000];

const presetConfig: Record<
  StreamingPreset,
  { maxWidth: number; videoBitrateKbps: number }
> = {
  low: { maxWidth: 1280, videoBitrateKbps: 2500 },
  medium: { maxWidth: 1920, videoBitrateKbps: 4500 },
  high: { maxWidth: 1920, videoBitrateKbps: 6500 }
};

let ffmpegProcess: ChildProcessWithoutNullStreams | null = null;
let statusPublisher: StatusPublisher | null = null;
let currentStatus: StreamStatusPayload = { status: "idle", message: null, startedAt: null };
let stopRequested = false;
let logStream: fs.WriteStream | null = null;
let currentStreamKey: string | null = null;
let currentEndpoint: string | null = null;
let sessionLogPath: string | null = null;
let cachedHeader: Buffer | null = null;
let needsHeader = false;
let reconnectAttempts = 0;
let reconnectTimer: NodeJS.Timeout | null = null;
let lastStartPayload: StreamStartPayload | null = null;
let lastError: string | null = null;

const availableEncoders = new Set<StreamingEncoder>(["x264"]);

const publishStatus = (payload: StreamStatusPayload) => {
  currentStatus = payload;
  if (statusPublisher) {
    statusPublisher(payload);
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
  if (currentStreamKey) {
    sanitized = sanitized.split(currentStreamKey).join("***");
  }
  if (currentEndpoint) {
    sanitized = sanitized.split(currentEndpoint).join(currentEndpoint.replace(/\/[^/]+$/, "/***"));
  }
  return sanitized;
};

const writeStreamLog = (line: string) => {
  ensureLogStream();
  logStream?.write(`${sanitizeLogLine(line)}\n`);
};

const isValidRtmpUrl = (rtmpUrl: string) => {
  try {
    const parsed = new URL(rtmpUrl);
    return parsed.protocol === "rtmp:" || parsed.protocol === "rtmps:";
  } catch {
    return false;
  }
};

const buildEndpoint = (rtmpUrl: string, streamKey: string) => {
  const trimmed = rtmpUrl.replace(/\/+$/, "");
  return `${trimmed}/${streamKey}`;
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
    if (output.includes("libx264")) {
      availableEncoders.add("x264");
    }
    if (output.includes("h264_nvenc")) {
      availableEncoders.add("nvenc");
    }
    if (output.includes("h264_qsv")) {
      availableEncoders.add("qsv");
    }
    if (output.includes("h264_amf")) {
      availableEncoders.add("amf");
    }
  } catch {
    // Ignore detection failures; fall back to x264.
  }
};

const resolveEncoder = (requested: StreamingEncoder) => {
  if (requested !== "auto" && availableEncoders.has(requested)) {
    return requested;
  }
  const priority: StreamingEncoder[] = ["nvenc", "qsv", "amf", "x264"];
  for (const encoder of priority) {
    if (availableEncoders.has(encoder)) {
      return encoder;
    }
  }
  return "x264";
};

const mapEncoder = (encoder: StreamingEncoder) => {
  switch (encoder) {
    case "nvenc":
      return "h264_nvenc";
    case "qsv":
      return "h264_qsv";
    case "amf":
      return "h264_amf";
    case "x264":
    default:
      return "libx264";
  }
};

const mapEncoderPreset = (encoder: StreamingEncoder) => {
  if (encoder === "x264") {
    return "veryfast";
  }
  if (encoder === "nvenc") {
    return "p4";
  }
  return null;
};

const buildFfmpegArgs = (payload: StreamStartPayload, encoder: StreamingEncoder) => {
  const preset = presetConfig[payload.preset];
  const fps = payload.fps;
  const gop = fps * 2;
  const bitrate = `${preset.videoBitrateKbps}k`;
  const encoderName = mapEncoder(encoder);
  const encoderPreset = mapEncoderPreset(encoder);

  const args = [
    "-hide_banner",
    "-loglevel",
    "info",
    "-fflags",
    "nobuffer",
    "-flags",
    "low_delay",
    "-max_delay",
    "0",
    "-i",
    "pipe:0",
    "-map",
    "0:v:0",
    "-vf",
    `scale='min(${preset.maxWidth},iw)':-2`,
    "-r",
    String(fps),
    "-c:v",
    encoderName,
    "-tune",
    "zerolatency",
    "-b:v",
    bitrate,
    "-maxrate",
    bitrate,
    "-bufsize",
    `${preset.videoBitrateKbps * 2}k`,
    "-pix_fmt",
    "yuv420p",
    "-g",
    String(gop),
    "-keyint_min",
    String(gop),
    "-sc_threshold",
    "0"
  ];

  if (encoderPreset) {
    args.splice(args.indexOf("-tune"), 0, "-preset", encoderPreset);
  }

  if (payload.hasAudio) {
    args.push("-map", "0:a:0?");
    args.push("-c:a", "aac", "-b:a", `${payload.audioBitrate}k`, "-ar", "44100");
  } else {
    args.push("-an");
  }

  args.push("-f", "flv");
  return args;
};

const scheduleReconnect = () => {
  if (!lastStartPayload || stopRequested) {
    return;
  }
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    publishStatus({
      status: "error",
      message: "Stream failed after multiple reconnect attempts. Check your network or RTMP settings.",
      startedAt: null,
      logPath: sessionLogPath,
      lastError
    });
    if (logStream) {
      logStream.end();
      logStream = null;
    }
    return;
  }

  reconnectAttempts += 1;
  const delay = RECONNECT_DELAYS_MS[Math.min(reconnectAttempts - 1, RECONNECT_DELAYS_MS.length - 1)];

  publishStatus({
    status: "reconnecting",
    message: `Reconnecting (${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})...`,
    startedAt: currentStatus.startedAt ?? null,
    logPath: sessionLogPath,
    reconnectAttempt: reconnectAttempts,
    reconnectMax: MAX_RECONNECT_ATTEMPTS,
    lastError
  });

  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (stopRequested) {
      return;
    }
    startFfmpeg(lastStartPayload, true);
  }, delay);
};

const startFfmpeg = (payload: StreamStartPayload, isReconnect: boolean) => {
  if (!ffmpegPath) {
    publishStatus({
      status: "error",
      message: "FFmpeg is unavailable. Install ffmpeg or reinstall dependencies.",
      startedAt: null
    });
    return;
  }

  const chosenEncoder = resolveEncoder(payload.encoder);
  const endpoint = buildEndpoint(payload.rtmpUrl, payload.streamKey);
  currentStreamKey = payload.streamKey;
  currentEndpoint = endpoint;
  needsHeader = true;

  const args = buildFfmpegArgs(payload, chosenEncoder);
  args.push(endpoint);

  if (!isReconnect) {
    reconnectAttempts = 0;
    lastError = null;
  }

  publishStatus({
    status: "connecting",
    message: null,
    startedAt: isReconnect ? currentStatus.startedAt ?? null : null,
    logPath: sessionLogPath,
    stats: isReconnect ? currentStatus.stats ?? null : null,
    reconnectAttempt: reconnectAttempts,
    reconnectMax: MAX_RECONNECT_ATTEMPTS,
    lastError
  });

  ffmpegProcess = spawn(ffmpegPath, args, {
    stdio: ["pipe", "ignore", "pipe"],
    windowsHide: true
  });

  ffmpegProcess.stderr.setEncoding("utf8");
  ffmpegProcess.stderr.on("data", (chunk: string) => {
    const lines = chunk.split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      writeStreamLog(line);
      const stats = parseStats(line);
      if (stats) {
        currentStatus = {
          ...currentStatus,
          stats,
          logPath: sessionLogPath,
          lastError
        };
        if (statusPublisher) {
          statusPublisher(currentStatus);
        }
      }
      if (line.toLowerCase().includes("error") || line.toLowerCase().includes("failed")) {
        lastError = sanitizeLogLine(line.trim());
      }
      if (currentStatus.status === "connecting" && line.includes("frame=")) {
        publishStatus({
          status: "live",
          message: null,
          startedAt: currentStatus.startedAt ?? Date.now(),
          logPath: sessionLogPath,
          stats: currentStatus.stats ?? null,
          lastError
        });
      }
    }
  });

  ffmpegProcess.on("error", (error) => {
    writeStreamLog(`ffmpeg spawn error: ${error.message}`);
    lastError = error.message;
    publishStatus({
      status: "error",
      message: "Unable to start streaming. Check FFmpeg and RTMP settings.",
      startedAt: null,
      logPath: sessionLogPath,
      lastError
    });
  });

  ffmpegProcess.on("close", (code, signal) => {
    const wasStopped = stopRequested;
    ffmpegProcess = null;
    currentStreamKey = null;
    currentEndpoint = null;

    if (wasStopped) {
      publishStatus({ status: "idle", message: null, startedAt: null, logPath: sessionLogPath });
      return;
    }

    lastError = lastError ?? `FFmpeg exited (code ${code ?? "?"}, signal ${signal ?? "?"}).`;
    log.warn(`Streaming stopped unexpectedly (code ${code ?? "?"}, signal ${signal ?? "?"}).`);
    scheduleReconnect();
  });
};

export const setStreamStatusPublisher = (publisher: StatusPublisher) => {
  statusPublisher = publisher;
  publisher(currentStatus);
};

export const getStreamLogPath = () => sessionLogPath;

export const getStreamingCapabilities = () => ({
  encoders: Array.from(availableEncoders)
});

export const getStreamingStatus = () => currentStatus;

export const startStreaming = async (payload: StreamStartPayload): Promise<StreamStartResult> => {
  if (ffmpegProcess) {
    return { ok: false, message: "Streaming is already active." };
  }
  if (!payload?.rtmpUrl || !payload?.streamKey) {
    return { ok: false, message: "RTMP URL and stream key are required." };
  }
  if (!isValidRtmpUrl(payload.rtmpUrl)) {
    return { ok: false, message: "Enter a valid RTMP URL (rtmp:// or rtmps://)." };
  }
  if (!ffmpegPath) {
    publishStatus({ status: "error", message: "FFmpeg is unavailable. Install ffmpeg or reinstall dependencies.", startedAt: null });
    return { ok: false, message: "FFmpeg is unavailable." };
  }

  sessionLogPath = createSessionLogPath();
  logStream = null;
  cachedHeader = null;
  reconnectAttempts = 0;
  stopRequested = false;
  lastStartPayload = payload;
  lastError = null;

  startFfmpeg(payload, false);
  log.info("Streaming started.");
  return { ok: true };
};

export const sendStreamChunk = (payload: Uint8Array) => {
  if (!payload || payload.length === 0) {
    return;
  }

  if (!cachedHeader) {
    cachedHeader = Buffer.from(payload);
  }

  if (!ffmpegProcess?.stdin || !ffmpegProcess.stdin.writable) {
    return;
  }

  try {
    if (needsHeader && cachedHeader) {
      ffmpegProcess.stdin.write(cachedHeader);
      needsHeader = false;
    }
    ffmpegProcess.stdin.write(Buffer.from(payload));
    if (currentStatus.status === "connecting") {
      publishStatus({
        status: "live",
        message: null,
        startedAt: currentStatus.startedAt ?? Date.now(),
        logPath: sessionLogPath,
        stats: currentStatus.stats ?? null,
        lastError
      });
    }
  } catch (error) {
    writeStreamLog(`stdin write failed: ${(error as Error).message}`);
  }
};

export const stopStreaming = async (): Promise<StreamStopResult> => {
  stopRequested = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  needsHeader = false;
  cachedHeader = null;

  if (!ffmpegProcess) {
    publishStatus({ status: "idle", message: null, startedAt: null, logPath: sessionLogPath });
    return { ok: false, message: "No active stream to stop." };
  }

  try {
    ffmpegProcess.stdin.end();
  } catch {
    // Ignore stdin shutdown failures.
  }

  ffmpegProcess.kill("SIGINT");

  const processRef = ffmpegProcess;
  setTimeout(() => {
    if (processRef && !processRef.killed) {
      processRef.kill("SIGKILL");
    }
  }, STOP_TIMEOUT_MS);

  log.info("Streaming stop requested.");
  if (logStream) {
    logStream.end();
    logStream = null;
  }
  return { ok: true };
};

detectEncoders();

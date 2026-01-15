import { ChildProcessWithoutNullStreams, spawn } from "child_process";
import fs from "fs";
import path from "path";
import { app } from "electron";
import ffmpegPath from "ffmpeg-static";
import log from "./logger";
import { StreamStartPayload, StreamStartResult, StreamStatusPayload, StreamStopResult } from "../../src/shared/types";

type StatusPublisher = (payload: StreamStatusPayload) => void;

const STREAM_LOG_NAME = "streaming.log";
const DEFAULT_VIDEO_BITRATE = "4500k";
const DEFAULT_AUDIO_BITRATE = "128k";
const DEFAULT_FPS = 30;
const STOP_TIMEOUT_MS = 4000;

let ffmpegProcess: ChildProcessWithoutNullStreams | null = null;
let statusPublisher: StatusPublisher | null = null;
let currentStatus: StreamStatusPayload = { status: "idle", message: null, startedAt: null };
let stopRequested = false;
let logStream: fs.WriteStream | null = null;
let currentStreamKey: string | null = null;
let currentEndpoint: string | null = null;

const getLogPath = () => path.join(app.getPath("userData"), "logs", STREAM_LOG_NAME);

const publishStatus = (payload: StreamStatusPayload) => {
  currentStatus = payload;
  if (statusPublisher) {
    statusPublisher(payload);
  }
};

const ensureLogStream = () => {
  if (logStream) {
    return;
  }
  const logPath = getLogPath();
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  logStream = fs.createWriteStream(logPath, { flags: "a" });
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

export const setStreamStatusPublisher = (publisher: StatusPublisher) => {
  statusPublisher = publisher;
  publisher(currentStatus);
};

export const getStreamLogPath = () => getLogPath();

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

  const endpoint = buildEndpoint(payload.rtmpUrl, payload.streamKey);
  currentStreamKey = payload.streamKey;
  currentEndpoint = endpoint;
  stopRequested = false;

  const args = [
    "-hide_banner",
    "-loglevel",
    "info",
    "-fflags",
    "nobuffer",
    "-i",
    "pipe:0",
    "-vf",
    "scale='min(1920,iw)':-2",
    "-r",
    String(DEFAULT_FPS),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-tune",
    "zerolatency",
    "-b:v",
    DEFAULT_VIDEO_BITRATE,
    "-maxrate",
    DEFAULT_VIDEO_BITRATE,
    "-bufsize",
    "9000k",
    "-pix_fmt",
    "yuv420p",
    "-g",
    String(DEFAULT_FPS * 2),
    "-keyint_min",
    String(DEFAULT_FPS * 2)
  ];

  if (payload.hasAudio) {
    args.push("-c:a", "aac", "-b:a", DEFAULT_AUDIO_BITRATE, "-ar", "44100");
  } else {
    args.push("-an");
  }

  args.push("-f", "flv", endpoint);

  publishStatus({ status: "connecting", message: null, startedAt: null });

  ffmpegProcess = spawn(ffmpegPath, args, {
    stdio: ["pipe", "ignore", "pipe"],
    windowsHide: true
  });

  ffmpegProcess.stderr.setEncoding("utf8");
  ffmpegProcess.stderr.on("data", (chunk: string) => {
    const lines = chunk.split(/\r?\n/).filter(Boolean);
    for (const line of lines) {
      writeStreamLog(line);
      if (currentStatus.status === "connecting" && line.includes("frame=")) {
        publishStatus({ status: "live", message: null, startedAt: Date.now() });
      }
    }
  });

  ffmpegProcess.on("error", (error) => {
    writeStreamLog(`ffmpeg spawn error: ${error.message}`);
    publishStatus({
      status: "error",
      message: "Unable to start streaming. Check FFmpeg and RTMP settings.",
      startedAt: null
    });
  });

  ffmpegProcess.on("close", (code, signal) => {
    const wasStopped = stopRequested;
    ffmpegProcess = null;
    stopRequested = false;
    currentStreamKey = null;
    currentEndpoint = null;

    if (wasStopped) {
      publishStatus({ status: "idle", message: null, startedAt: null });
      return;
    }

    const message = "Stream ended unexpectedly. Check the RTMP settings and logs.";
    publishStatus({ status: "error", message, startedAt: null });
    log.warn(`Streaming stopped unexpectedly (code ${code ?? "?"}, signal ${signal ?? "?"}).`);
  });

  log.info("Streaming started.");
  return { ok: true };
};

export const sendStreamChunk = (payload: Uint8Array) => {
  if (!ffmpegProcess?.stdin || !payload || payload.length === 0) {
    return;
  }
  if (!ffmpegProcess.stdin.writable) {
    return;
  }
  if (currentStatus.status === "connecting") {
    publishStatus({ status: "live", message: null, startedAt: Date.now() });
  }
  try {
    ffmpegProcess.stdin.write(Buffer.from(payload));
  } catch (error) {
    writeStreamLog(`stdin write failed: ${(error as Error).message}`);
  }
};

export const stopStreaming = async (): Promise<StreamStopResult> => {
  if (!ffmpegProcess) {
    publishStatus({ status: "idle", message: null, startedAt: null });
    return { ok: false, message: "No active stream to stop." };
  }

  stopRequested = true;

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
  return { ok: true };
};

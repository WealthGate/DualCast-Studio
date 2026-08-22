import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { app } from "electron";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { RecordingChunkPayload, RecordingSessionPayload, SaveRecordingPayload, SaveRecordingResult } from "../../src/shared/types";
import { formatRecordingFilename } from "../../src/shared/recording";
import { getSettings, getDefaultSaveDirectory } from "./settingsService";
import log from "./logger";
import { RecordingDiskSession } from "./recordingDiskSession";

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

const recordingSessions = new Map<string, RecordingDiskSession>();
const activeRecordingCommands = new Set<ReturnType<typeof ffmpeg>>();
const MAX_CHUNK_BYTES = 64 * 1024 * 1024;

const normalizeRecordingData = (data: SaveRecordingPayload["data"]) => {
  if (!data) {
    return null;
  }
  if (data instanceof Uint8Array) {
    return Buffer.from(data);
  }
  if (data instanceof ArrayBuffer) {
    return Buffer.from(new Uint8Array(data));
  }
  if (Array.isArray(data)) {
    return Buffer.from(data);
  }
  if (typeof (data as Uint8Array).buffer === "object") {
    return Buffer.from(data as Uint8Array);
  }
  return null;
};

const transcodeWebmToMp4 = (inputPath: string, outputPath: string) =>
  new Promise<void>((resolve, reject) => {
    const command = ffmpeg(inputPath)
      .outputOptions([
        "-c:v libx264",
        "-preset veryfast",
        "-pix_fmt yuv420p",
        "-c:a aac",
        "-b:a 192k",
        "-movflags +faststart"
      ])
      .on("end", () => {
        activeRecordingCommands.delete(command);
        resolve();
      })
      .on("error", (error) => {
        activeRecordingCommands.delete(command);
        reject(error);
      })
      .save(outputPath);
    activeRecordingCommands.add(command);
  });

const availableOutputPath = async (directory: string, fileName: string) => {
  const parsed = path.parse(fileName);
  for (let index = 1; index < 10_000; index += 1) {
    const candidate = path.join(directory, index === 1 ? fileName : `${parsed.name}-${index}${parsed.ext}`);
    try {
      await fs.promises.access(candidate);
    } catch {
      return candidate;
    }
  }
  throw new Error("Unable to choose a unique recording filename.");
};

const finalizeRecording = async (tempPath: string): Promise<SaveRecordingResult> => {
  const settings = getSettings();
  const outputDir = settings.saveDirectory || getDefaultSaveDirectory();
  await fs.promises.mkdir(outputDir, { recursive: true });
  const outputPath = await availableOutputPath(outputDir, formatRecordingFilename(new Date()));
  let finalPath = outputPath;
  let usedFallback = false;

  try {
    if (ffmpegPath) {
      try {
        await transcodeWebmToMp4(tempPath, outputPath);
      } catch (error) {
        usedFallback = true;
        await fs.promises.unlink(outputPath).catch(() => undefined);
        finalPath = await availableOutputPath(outputDir, path.basename(outputPath).replace(/\.mp4$/, ".webm"));
        await fs.promises.copyFile(tempPath, finalPath);
        log.warn("FFmpeg MP4 export failed, kept WebM output.", error);
      }
    } else {
      usedFallback = true;
      finalPath = await availableOutputPath(outputDir, path.basename(outputPath).replace(/\.mp4$/, ".webm"));
      await fs.promises.copyFile(tempPath, finalPath);
    }

    return {
      filePath: finalPath,
      fileName: path.basename(finalPath),
      usedFallback
    };
  } finally {
    await fs.promises.unlink(tempPath).catch(() => undefined);
  }
};

export const beginRecording = async () => {
  const sessionId = randomUUID();
  const tempPath = path.join(app.getPath("temp"), `openchurch-recording-${sessionId}.webm`);
  recordingSessions.set(sessionId, await RecordingDiskSession.create(tempPath));
  return { sessionId };
};

export const appendRecordingChunk = async (payload: RecordingChunkPayload) => {
  const session = recordingSessions.get(payload?.sessionId);
  if (!session) throw new Error("The recording session is no longer active.");
  const buffer = normalizeRecordingData(payload.data);
  if (!buffer?.length) return true;
  if (buffer.length > MAX_CHUNK_BYTES) throw new Error("A recording chunk exceeded the safe size limit.");
  await session.append(buffer);
  return true;
};

export const finishRecording = async (payload: RecordingSessionPayload) => {
  const session = recordingSessions.get(payload?.sessionId);
  if (!session) throw new Error("The recording session is no longer active.");
  recordingSessions.delete(payload.sessionId);
  try {
    const bytesWritten = await session.seal();
    if (bytesWritten === 0) throw new Error("No recording data was captured.");
    return await finalizeRecording(session.filePath);
  } catch (error) {
    await fs.promises.unlink(session.filePath).catch(() => undefined);
    throw error;
  }
};

export const cancelRecording = async (payload: RecordingSessionPayload) => {
  const session = recordingSessions.get(payload?.sessionId);
  if (!session) return false;
  recordingSessions.delete(payload.sessionId);
  await session.cancel();
  return true;
};

export const cleanupRecordingSessions = () => {
  activeRecordingCommands.forEach((command) => {
    try {
      command.kill("SIGKILL");
    } catch {
      // The converter may already have exited.
    }
  });
  activeRecordingCommands.clear();
  recordingSessions.forEach((session) => session.disposeSync());
  recordingSessions.clear();
};

export const cleanupStaleRecordingFiles = async () => {
  const tempDirectory = app.getPath("temp");
  const files = await fs.promises.readdir(tempDirectory).catch(() => [] as string[]);
  await Promise.all(files
    .filter((file) => /^openchurch-recording-(?:legacy-)?[0-9a-f-]+\.webm$/i.test(file))
    .map((file) => fs.promises.unlink(path.join(tempDirectory, file)).catch(() => undefined)));
};

export const saveRecording = async (payload: SaveRecordingPayload): Promise<SaveRecordingResult> => {
  const dataBuffer = normalizeRecordingData(payload?.data);
  if (!dataBuffer || dataBuffer.length === 0) {
    throw new Error("No recording data received.");
  }

  const tempPath = path.join(app.getPath("temp"), `openchurch-recording-legacy-${randomUUID()}.webm`);

  await fs.promises.writeFile(tempPath, dataBuffer);
  return finalizeRecording(tempPath);
};

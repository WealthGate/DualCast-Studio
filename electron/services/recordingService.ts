import fs from "fs";
import path from "path";
import { app } from "electron";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { SaveRecordingPayload, SaveRecordingResult } from "../../src/shared/types";
import { formatRecordingFilename } from "../../src/shared/recording";
import { getSettings, getDefaultSaveDirectory } from "./settingsService";
import log from "./logger";

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

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
    ffmpeg(inputPath)
      .outputOptions([
        "-c:v libx264",
        "-preset veryfast",
        "-pix_fmt yuv420p",
        "-c:a aac",
        "-b:a 192k",
        "-movflags +faststart"
      ])
      .on("end", () => resolve())
      .on("error", (error) => reject(error))
      .save(outputPath);
  });

export const saveRecording = async (payload: SaveRecordingPayload): Promise<SaveRecordingResult> => {
  const dataBuffer = normalizeRecordingData(payload?.data);
  if (!dataBuffer || dataBuffer.length === 0) {
    throw new Error("No recording data received.");
  }

  const settings = getSettings();
  const outputDir = settings.saveDirectory || getDefaultSaveDirectory();
  await fs.promises.mkdir(outputDir, { recursive: true });

  const fileName = formatRecordingFilename(new Date());
  const outputPath = path.join(outputDir, fileName);
  const tempPath = path.join(app.getPath("temp"), fileName.replace(/\.mp4$/, ".webm"));

  await fs.promises.writeFile(tempPath, dataBuffer);

  let finalPath = outputPath;
  let usedFallback = false;

  if (ffmpegPath) {
    try {
      await transcodeWebmToMp4(tempPath, outputPath);
    } catch (error) {
      usedFallback = true;
      finalPath = outputPath.replace(/\.mp4$/, ".webm");
      await fs.promises.copyFile(tempPath, finalPath);
      log.warn("FFmpeg MP4 export failed, kept WebM output.", error);
    }
  } else {
    usedFallback = true;
    finalPath = outputPath.replace(/\.mp4$/, ".webm");
    await fs.promises.copyFile(tempPath, finalPath);
  }

  await fs.promises.unlink(tempPath).catch(() => undefined);

  return {
    filePath: finalPath,
    fileName: path.basename(finalPath),
    usedFallback
  };
};

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

const remuxWebmToMp4 = (inputPath: string, outputPath: string) =>
  new Promise<void>((resolve, reject) => {
    ffmpeg(inputPath)
      .outputOptions(["-c copy"])
      .on("end", () => resolve())
      .on("error", (error) => reject(error))
      .save(outputPath);
  });

export const saveRecording = async (payload: SaveRecordingPayload): Promise<SaveRecordingResult> => {
  if (!payload?.data || payload.data.length === 0) {
    throw new Error("No recording data received.");
  }

  const settings = getSettings();
  const outputDir = settings.saveDirectory || getDefaultSaveDirectory();
  await fs.promises.mkdir(outputDir, { recursive: true });

  const fileName = formatRecordingFilename(new Date());
  const outputPath = path.join(outputDir, fileName);
  const tempPath = path.join(app.getPath("temp"), fileName.replace(/\.mp4$/, ".webm"));

  await fs.promises.writeFile(tempPath, Buffer.from(payload.data));

  let finalPath = outputPath;
  let usedFallback = false;

  if (ffmpegPath) {
    try {
      await remuxWebmToMp4(tempPath, outputPath);
    } catch (error) {
      usedFallback = true;
      finalPath = outputPath.replace(/\.mp4$/, ".webm");
      await fs.promises.copyFile(tempPath, finalPath);
      log.warn("FFmpeg remux failed, kept WebM output.", error);
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

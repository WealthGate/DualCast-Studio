import fs from "fs";
import path from "path";
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import { ExportClipPayload, ExportClipResult } from "../../src/shared/types";

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

const activeEditorCommands = new Set<ReturnType<typeof ffmpeg>>();

export const exportClip = async (payload: ExportClipPayload): Promise<ExportClipResult> => {
  if (!ffmpegPath) {
    throw new Error("FFmpeg is unavailable.");
  }
  if (!payload?.inputPath || !fs.existsSync(payload.inputPath)) {
    throw new Error("Select a valid recording.");
  }

  const startSeconds = Math.max(0, Number(payload.startSeconds) || 0);
  const endSeconds = Number(payload.endSeconds);
  if (!Number.isFinite(endSeconds) || endSeconds <= startSeconds) {
    throw new Error("End time must be greater than start time.");
  }

  const parsed = path.parse(payload.inputPath);
  const outputPath = path.join(parsed.dir, `${parsed.name}-edited-${Date.now()}.mp4`);

  try {
    await new Promise<void>((resolve, reject) => {
      const command = ffmpeg(payload.inputPath)
        .setStartTime(startSeconds)
        .setDuration(endSeconds - startSeconds)
        .outputOptions([
          "-c:v libx264",
          "-preset veryfast",
          "-pix_fmt yuv420p",
          "-c:a aac",
          "-b:a 192k",
          "-movflags +faststart"
        ])
        .on("end", () => {
          activeEditorCommands.delete(command);
          resolve();
        })
        .on("error", (error) => {
          activeEditorCommands.delete(command);
          reject(error);
        })
        .save(outputPath);
      activeEditorCommands.add(command);
    });
  } catch (error) {
    await fs.promises.unlink(outputPath).catch(() => undefined);
    throw error;
  }

  return {
    filePath: outputPath,
    fileName: path.basename(outputPath)
  };
};

export const cleanupEditorCommands = () => {
  activeEditorCommands.forEach((command) => {
    try {
      command.kill("SIGKILL");
    } catch {
      // The editor process may already have exited.
    }
  });
  activeEditorCommands.clear();
};

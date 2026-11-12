import fs from "fs";

const ASAR_PATH_SEGMENT = /([\\/])app\.asar([\\/])/i;

/**
 * Executables cannot be launched from inside an ASAR archive. Electron Builder
 * places native binaries beside the archive in app.asar.unpacked, so packaged
 * paths must be redirected there before they are passed to child_process.
 */
export const resolveFfmpegExecutablePath = (
  bundledPath: string | null,
  existsSync: (candidate: string) => boolean = fs.existsSync
) => {
  if (!bundledPath) return null;

  const unpackedPath = bundledPath.replace(ASAR_PATH_SEGMENT, "$1app.asar.unpacked$2");
  if (unpackedPath !== bundledPath) {
    return existsSync(unpackedPath) ? unpackedPath : null;
  }

  return existsSync(bundledPath) ? bundledPath : null;
};

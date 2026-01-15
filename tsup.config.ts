import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["electron/main.ts", "electron/preload.ts"],
  outDir: "dist-electron",
  format: ["cjs"],
  sourcemap: true,
  clean: true,
  target: "node16",
  dts: false,
  external: ["electron", "fluent-ffmpeg", "ffmpeg-static"]
});

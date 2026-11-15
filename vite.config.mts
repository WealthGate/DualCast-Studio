import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { readFile } from "node:fs/promises";

export default defineConfig({
  root: path.resolve(import.meta.dirname, "src/renderer"),
  base: "./",
  plugins: [react(), {
    name: "openchurch-audio-worklet",
    apply: "build",
    async generateBundle() {
      const source = await readFile(path.resolve(import.meta.dirname, "src/renderer/utils/audioPluginProcessor.js"), "utf8");
      this.emitFile({ type: "asset", fileName: "audio-plugin-worklet.js", source });
    }
  }],
  server: {
    port: 5173
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/renderer"),
    emptyOutDir: true
  }
});

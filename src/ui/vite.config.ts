import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "node:path";

export default defineConfig({
  root: import.meta.dirname,
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: path.resolve(import.meta.dirname, "../../dist-ui"),
    emptyOutDir: true,
    target: "es2022",
    assetsInlineLimit: 100_000_000,
    cssCodeSplit: false,
  },
  logLevel: "warn",
});

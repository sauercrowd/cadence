import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react-swc";
import { defineConfig } from "vite";

const webDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: webDir,
  plugins: [react()],
  build: {
    outDir: path.resolve(webDir, "../internal/web/dist"),
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:7331",
    },
  },
});

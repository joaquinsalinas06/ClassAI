import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const backend = process.env.CLASSAI_API ?? "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // App shell (React, router, motion, charts) is ~170 kB gzip; secondary pages are already split per route.
  build: { chunkSizeWarningLimit: 600 },
  server: {
    port: 5173,
    proxy: {
      "/api": { target: backend, changeOrigin: true, rewrite: (path) => path.replace(/^\/api/, "") },
    },
  },
  preview: {
    proxy: {
      "/api": { target: backend, changeOrigin: true, rewrite: (path) => path.replace(/^\/api/, "") },
    },
  },
  test: { environment: "node", include: ["src/**/*.test.ts"] },
});

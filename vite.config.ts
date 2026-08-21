import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error type error without @types/node package
import process from "node:process";
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [react()],

  build: {
    // Tauri bundles assets itself; skip Vite's polyfill overhead for modern webview targets
    target: "chrome105",
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        // Rolldown (Vite 8) requires the function form of manualChunks
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@monaco-editor")) return "monaco";
          if (id.includes("/xterm")) return "xterm";
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return "react";
        },
      },
    },
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));

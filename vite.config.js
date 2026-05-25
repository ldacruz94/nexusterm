import { defineConfig } from 'vite';

export default defineConfig({
  clearScreen: false,
  server: {
    port: 5173,
    strictPort: true,
    watch: {
      // Don't trigger Vite reloads when Rust files change — Tauri handles those.
      ignored: ['**/src-tauri/**'],
    },
  },
  build: {
    target: ['es2022', 'chrome105', 'safari16'],
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
  },
});

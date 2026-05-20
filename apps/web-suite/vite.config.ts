import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Phase 1.1e shell.
//
// No external CDN, no remote fonts, no remote analytics. Everything is
// bundled. `base: './'` makes the build relocatable for a static-host
// drop-in (or for a future Tauri webview).
export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    sourcemap: true,
    target: 'es2022',
  },
  server: {
    port: 5173,
    strictPort: false,
  },
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
});

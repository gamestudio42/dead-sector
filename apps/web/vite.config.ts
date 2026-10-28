import { defineConfig } from 'vite';

// DS_BASE lets the static build live under a sub-path (e.g. GitHub Pages: DS_BASE=/dead-sector/).
export default defineConfig({
  base: process.env.DS_BASE ?? './',
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 2000 },
});

import { execSync } from 'node:child_process';
import { defineConfig } from 'vite';
import pkg from './package.json' with { type: 'json' };

/** Version shown in the menu: package version + commit, no timestamp (reproducible builds). */
function buildId(): string {
  try {
    return `${pkg.version}+${execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim()}`;
  } catch {
    return pkg.version;
  }
}

// DS_BASE lets the static build live under a sub-path (e.g. GitHub Pages: DS_BASE=/dead-sector/).
export default defineConfig({
  base: process.env.DS_BASE ?? './',
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 2000 },
  define: { __BUILD_ID__: JSON.stringify(buildId()) },
});

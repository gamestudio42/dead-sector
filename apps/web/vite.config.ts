import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, type Plugin } from 'vite';
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

const WEB_ROOT = dirname(fileURLToPath(import.meta.url));

/** Lists every built file except the worker itself, so install can cache the whole game. */
function walkDist(dir: string, root: string, out: string[]): void {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walkDist(path, root, out);
    else if (name !== 'sw.js') out.push(`./${relative(root, path).replaceAll('\\', '/')}`);
  }
}

/**
 * Rewrites dist/sw.js with the files this build emitted. Dev and tests do not register a worker.
 */
function precacheWorker(): Plugin {
  return {
    name: 'precache-worker',
    apply: 'build',
    closeBundle() {
      const dist = join(WEB_ROOT, 'dist');
      const swPath = join(dist, 'sw.js');
      const files: string[] = [];
      walkDist(dist, dist, files);
      const shell = new Set(['./', './index.html', './manifest.webmanifest', './icon.svg']);
      const extra = files
        .filter((file) => !shell.has(file))
        .map((file) => JSON.stringify(file))
        .join(',\n  ');
      const hash = createHash('sha256').update(files.join('\n')).digest('hex').slice(0, 10);
      const sw = readFileSync(swPath, 'utf8');
      if (!sw.includes('/*__DS_ASSETS__*/')) throw new Error('sw.js is missing the precache slot');
      writeFileSync(
        swPath,
        sw
          .replace('/*__DS_ASSETS__*/', extra)
          .replace("const CACHE = 'dead-sector-v2';", `const CACHE = 'dead-sector-${hash}';`),
      );
    },
  };
}

// DS_BASE lets the static build live under a sub-path (e.g. GitHub Pages: DS_BASE=/dead-sector/).
export default defineConfig({
  base: process.env.DS_BASE ?? './',
  plugins: [precacheWorker()],
  server: { port: 5173 },
  build: { chunkSizeWarningLimit: 2000 },
  define: { __BUILD_ID__: JSON.stringify(buildId()) },
});

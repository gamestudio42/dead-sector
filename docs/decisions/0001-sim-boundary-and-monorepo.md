# 0001 — Pure simulation package and monorepo layout

**Status:** accepted

- `@dead-sector/sim` holds every rule and is plain TypeScript. ESLint forbids `phaser`, `window`, `document`,
  `localStorage`, `performance` globals and `Math.random` in `packages/sim/src`; `architecture.test.ts` also scans
  the sources and runs the simulation in Node.
- `@dead-sector/content` holds JSON + Zod schemas and cross-reference validation. The sim depends on it for types and
  tuning; the web app validates content at boot (`BootScene`) and shows a descriptive error if it fails.
- Packages are consumed as TypeScript source (`main: src/index.ts`) — no per-package build step; Vite and Vitest
  compile directly. Trade-off: packages are not publishable as-is, which is fine for a game.

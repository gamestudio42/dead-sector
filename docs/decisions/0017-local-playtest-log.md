# ADR 0017 — Local, opt-in playtest log

**Status:** accepted — 2026-11-13

## Context

All balance evidence so far comes from scripted bots on fixed routes. Before adding content
(Phase 6.3 onward) the team needs to know where real people get stuck, die, quit or stop coming
back. The game is a static site on GitHub Pages and a desktop snap, with no server, and
`AGENTS.md` asks for no server dependency.

## Decision

- The client keeps a **playtest log** in `localStorage` (`dead-sector:playtestLog`), off by
  default, turned on in Opções → Playtest or with `?playtest=1` in the link.
- Nothing is transmitted. The tester exports a versioned JSON file (`dead-sector-playtest`,
  version 1) and sends it by hand. `tools/playtest/report.mjs` merges files into Markdown.
- Sim-derived entries come from a pure function (`apps/web/src/telemetry/entries.ts`) that only
  reads the state; a test hashes the state before and after on a full scripted mission, and checks
  the log is identical for the same seed and orders.
- Interface counters and real time live in `MissionPlaytest` in the client. A mission that ends
  writes `missionEnd`; leaving early writes `missionAbandon` with how (menu, restart, load, closed
  tab via `pagehide`).
- The log keeps the newest 6000 entries (well under 1 MB) and drops older ones.

## Consequences

- No consent flow, privacy policy or hosting is needed: data leaves the machine only when the
  tester chooses to send a file.
- Collection depends on testers exporting and sending files; this suits small, organised rounds,
  not a public launch. Anonymous analytics at scale would need a new decision (and a backend).
- Logs from the web and the desktop snap are separate, like their saves.
- The export format is versioned; the report script refuses versions it does not know.

# 0002 — Plain-JSON game state, saves and replay

**Status:** accepted

- `GameState` is plain JSON (arrays and records, no Maps/classes), so a save is `JSON.stringify` of the full state,
  including `rngState`, cooldowns, timers, fog, contacts and pending noises. Per-tick indices (maps by id, spatial
  hashes) live in a rebuildable `TickContext`.
- Entities are stored in arrays in creation order; iteration order is therefore deterministic and survives a JSON
  round-trip. Tie-breaks use distance then stable id.
- Saves are wrapped in an envelope (`format`, `savedAtTick`, `missionId`, `seed`) and validated with Zod before use;
  newer schema versions are rejected, older ones go through `Migrations.ts`.
- Zod's `passthrough` reorders keys, which changed the state hash after load. We validate with Zod but migrate the
  _raw_ parsed object, keeping key order (and hashes) identical.
- Replays are `seed + commands with scheduledTick`; `hashState` (FNV-1a over canonical JSON) is logged every 100 ticks
  in debug mode. Tests assert identical hashes for re-runs, replays and save/load continuation.

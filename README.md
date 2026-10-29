# Dead Sector

An original, pausable real-time tactics game in a zombie outbreak. You command **squads**, not soldiers: survivors
act on their own under threat, infected react only to what they **see and hear**, and every gunshot propagates
through the streets and draws the horde. Spiritual successor in _mechanics_ to classic squad-tactics games; all code,
map, rules and visuals are original.

> Vertical slice (MVP Phase 4): the complete mission **"A Última Farmácia"** on the map **Bairro da Ferrugem**.
> Player-facing UI is in PT-BR; code and docs are in English.

## Quick start

Requirements: Node 22+, pnpm 10+.

```bash
pnpm install
pnpm dev            # http://localhost:5173  (add ?debug=1 for the debug overlay)
pnpm test           # 47 unit/integration tests (Vitest, Node only — no DOM)
pnpm e2e            # Playwright: builds, serves on :4173 and plays the mission in Chromium
pnpm check          # typecheck + lint + unit tests + production build
pnpm build          # static build in apps/web/dist (DS_BASE=/sub/path/ pnpm build for GitHub Pages)
```

First Playwright run: `pnpm --filter @dead-sector/game exec playwright install chromium`.

## How to play

| Input                                         | Action                                                               |
| --------------------------------------------- | -------------------------------------------------------------------- |
| Left click / `1`–`4` / squad card             | select squad (Alfa, Bravo)                                           |
| Right click on ground                         | move in the squad's current mode                                     |
| Right click on a visible infected             | attack order                                                         |
| Right click on door, cabinet, civilian, radio | interact (open/close/force door, collect, rescue, call extraction)   |
| `Q` / `W` / `E`                               | sneak / move / sprint (re-issues the current move)                   |
| `H` / `T` / `R` / `G`                         | hold / hide / retreat / regroup on leader                            |
| `F`                                           | fire discipline: return fire → weapons free → hold fire              |
| `Space` / `Tab` / `Esc`                       | pause (orders given while paused run on resume) / 1×–2× / pause menu |
| Arrows, mouse wheel, middle drag              | camera                                                               |
| `M`                                           | mute / unmute (volume, blood and lighting in the main menu)          |
| `` ` `` or `?debug=1`                         | debug overlay                                                        |

Mission: enter the pharmacy perimeter → collect medicine (5 s) → rescue the civilian (3 s, she then follows on foot) →
activate the radio in the south parking lot → hold the extraction zone 20 s with at least one survivor **and** the
civilian. Fail if everyone dies, the civilian dies, or 15 minutes pass. Leaving without her (button after the hold)
is a _partial success_.

Two proven ways to win on the canonical seed (automated tests replay both):

- **Stealth**: sneak with hold fire through the NW alley, cross the streets at quiet points, force the locked back
  door with the mechanic, exit to the south lane. 0 shots, no reinforcements.
- **Combat**: weapons free down the main avenue and through the front door: ~375 rounds, ~16 reinforcements drawn by noise.

## What works (by milestone)

- **A — Foundation**: pnpm monorepo, `@dead-sector/sim` pure TS (no DOM/Phaser, lint-enforced), fixed 100 ms tick,
  injected seeded RNG (state saved with the game), 96×96 map rendered with camera pan/zoom, 2 squads × 4 survivors with selection.
- **B — Movement**: tile passability, A* with terrain costs and no corner cutting, formation slots, sneak/move/sprint
  with speed, stamina and footstep noise; route preview; `ORDER_BLOCKED` (no path / stuck after replans / locked).
- **C — Perception & zombies**: supercover LOS (walls, bushes, closed doors opaque; windows transparent), 120° FOV +
  3 m peripheral, fog of war (unexplored/explored/visible), last-known contact markers; acoustic field by
  intensity-budgeted Dijkstra with wall/door absorption; walker/runner FSM idle → wander → investigate → pursue →
  attack → search, staggered 0.3–1 s; door bashing; debug overlay (LOS lines, acoustic heat map, FSM labels, spawners, FPS, tick ms, seed).
- **D — Combat & stress**: fire discipline, pistol/carbine/shotgun/melee from JSON, ammo/reload, hit chance formula,
  one round + one noise + one RNG draw per shot, no shooting through walls, deaths processed once, bites/infection
  stage, stress formula + impulses, panic hysteresis (enter ≥75, leave <55 after ≥4 s), flee/freeze by courage,
  shaken survivors refusing risky moves, leader succession; HUD for all of it and a PT-BR event log.
- **E — Mission**: interactions (doors, cabinet, civilian, radio), civilian follower, extraction hold with radio pulses
  that attract infected, noise-driven reinforcements from 4 auditable map entries (budget 30, cap 60), win/partial/fail,
  debriefing (duration, extracted, dead, wounded, ammo, total noise, supplies, outcome), menu, quicksave/load
  (IndexedDB, versioned + validated), replay/state hash, E2E.

- **Presentation pass (block 1 of the quality roadmap)**: procedurally painted terrain at 2× (asphalt cracks,
  curbs, sidewalk slabs, grass, rubble, checkered interiors, brick walls with height and soft drop shadows, cars,
  puddles, litter, per-pixel weathering and grain); original top-down character sprites generated at boot (per-template
  outfits and weapons, 8-frame walk cycle, attack and corpse frames) with facing smoothing, hit flash, fade-in/out and
  death fall with blood pool; soft fog of war (eased, upscaled and blurred); dusk lighting (survivor lanterns and
  flashlight cones, muzzle flashes, radio beacon, smouldering wrecks with smoke); particles (dust, sparks, ichor/blood,
  door debris), ground blood decals, camera shake, damage vignette, order markers; procedural WebAudio sound (weapon
  shots with reverb, groans/shrieks, footsteps per surface, doors, reloads, injuries, radio, stingers, wind bed and an
  adaptive tension drone), spatialized by camera and muffled outside the field of view; PT-BR survivor barks.
  Everything is presentation-only: cues and barks are derived from sim events and covered by tests that check they
  never change the state.

## Verification evidence (this build)

- `pnpm check`: typecheck ✓, ESLint ✓, **54/54** Vitest ✓, production build ✓.
- `pnpm e2e`: **5/5** Playwright ✓ — full critical flow to debriefing, stealth run without shots, save/load,
  HUD fits at 1280×720 and 1920×1080, no console errors.
- Performance (Node, combat run, 8 survivors + up to 30 live infected): p50 0.85 ms, **p95 7.2 ms/tick** (spec target < 10 ms).
- Screenshots: [`docs/testing/screenshots/`](docs/testing/screenshots/).
- Test ↔ requirement map: [`docs/testing/README.md`](docs/testing/README.md).

## Known issues / limitations (honest list)

- Art and audio are **original but procedural** (drawn/synthesized in code). Characters are small top-down
  silhouettes with a simple walk cycle; a hand-made or licensed (CC0) sprite set would raise fidelity further. No music
  score beyond the adaptive drone.
- Rendering performance was checked only in headless Chromium (software GL); no measured FPS budget on low-end GPUs yet.
- No minimap (spec §13.1) and no drag-box selection; shift-queued waypoints not implemented.
- Infection is tracked and reported (HUD, debriefing) but never turns survivors in battle (as the MVP spec allows).
- Heavy/screamer infected, night lighting and multiple maps are later phases.
- Balance is tuned for the canonical seed (1337); other seeds are playable but scripted bots sometimes lose the civilian there.

## Next tasks

See [`TASKS.md`](TASKS.md). Short version: premium HUD + minimap + options/accessibility (block 2), full controls
(waypoints, drag select, context menu), tactical depth (barricades, turning infected, heavy/screamer, hordes), more
missions/maps (Phase 5).

## Layout

```
apps/web            Phaser + HTML HUD (scenes, render, input, ui, e2e)
packages/sim        deterministic simulation (engine, model, systems, spatial, save, testing)
packages/content    JSON content + Zod schemas (weapons, zombies, survivors, missions, maps, rules, difficulty)
docs/               architecture, decisions (ADRs), game design, testing
scripts/            generate-map.mjs (source of the map JSON)
```

# Dead Sector

An original, pausable real-time tactics game in a zombie outbreak. You command **squads**, not soldiers: survivors
act on their own under threat, infected react only to what they **see and hear**, and every gunshot propagates
through the streets and draws the horde. Spiritual successor in _mechanics_ to classic squad-tactics games; all code,
map, rules and visuals are original.

> Campaign **"Setor Ferrugem"**: three linked missions — **A Última Farmácia** (Bairro da Ferrugem), **Sinal Fraco**
> (Pátio da Ferrovia) and **Plantão Noturno** (Centro Velho, at night) — with persistent losses, plus single missions.
> Player-facing UI is in PT-BR; code and docs are in English.

## Quick start

Requirements: Node 22+, pnpm 10+.

```bash
pnpm install
pnpm dev            # http://localhost:5173  (add ?debug=1 for the debug overlay)
pnpm test           # unit/integration tests (Vitest, Node only — no DOM)
pnpm e2e            # Playwright: builds, serves on :4317 and plays the missions in Chromium
pnpm balance        # multi-seed balance report → docs/testing/balance.md (opt-in, ~2 min)
pnpm check          # typecheck + lint + unit tests + production build
pnpm build          # static build in apps/web/dist (DS_BASE=/sub/path/ pnpm build for GitHub Pages)
```

First Playwright run: `pnpm --filter @dead-sector/game exec playwright install chromium`.

**Install as an app (desktop, offline)**: serve the production build (`pnpm build && pnpm preview`, or any static
host over HTTPS), open it in Chrome/Edge and use "Instalar Dead Sector" in the address bar. It runs full-screen in its
own window and starts offline after the first visit (service worker, no server needed). Reproducible build:
`pnpm install --frozen-lockfile && pnpm build`; the menu shows the version and commit (`0.1.0+<sha>`).

## How to play

| Input                                         | Action                                                                  |
| --------------------------------------------- | ----------------------------------------------------------------------- |
| Left click / `1`–`4` / squad card             | select squad (Alfa, Bravo); with `Shift`: add/remove                    |
| Left drag                                     | box-select every squad inside (`Shift`: add)                            |
| Right click on ground                         | move in the squad's current mode (several squads line up side by side)  |
| `Shift` + right click                         | queue a waypoint after the current order (up to 8, numbered on map)     |
| `Ctrl` + right click                          | order menu at that spot: move/sneak/sprint, go and hold, go and hide…   |
| `B` (cursor on a door/window)                 | barricade it with a plank kit (2 per squad; hammering is loud)          |
| Right click on a visible infected             | attack order                                                            |
| Right click on door, cabinet, civilian, radio | interact (open/close/force door, collect, rescue, call extraction)      |
| `Q` / `W` / `E`                               | sneak / move / sprint (re-issues the current move)                      |
| `H` / `T` / `R` / `G`                         | hold / hide / retreat / regroup on leader                               |
| `F`                                           | fire discipline: return fire → weapons free → hold fire                 |
| `Space` / `Tab` / `Esc`                       | pause (orders given while paused run on resume) / 1×–2× / pause menu    |
| `F5` / `F9`                                   | quicksave / quickload                                                   |
| Minimap: left click / right click             | move camera / send the selected squads there                            |
| Any key above                                 | rebindable in **Opções → Controles** (physical keys, swaps on conflict) |
| Arrows, mouse wheel, middle drag              | camera                                                                  |
| `M`                                           | mute / unmute (all settings in **Opções**: menu or ⚙ in the HUD)        |
| `` ` `` or `?debug=1`                         | debug overlay                                                           |

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

- **Interface pass (block 2)**: title screen over a live, decorative view of the map; briefing with map, objectives,
  intel, roster and seed choice; compact HUD with icon top bar, collapsible objectives/log/unit strip (remembered),
  tooltips that explain orders and each survivor's state; minimap (explored terrain, own units, visible and last-known
  contacts only, mission areas, camera frame, event pings; click to pan, right-click to move the squad); options
  (master/effects/ambience volume, mute, lighting, blood, HUD scale, sound captions with direction and distance, high
  contrast, camera shake/flash toggle, controls list); debriefing with S–F grade and reasons, stat tiles, timeline of
  key moments and a route map with each survivor's path and losses.

- **Controls pass (block 3)**: multi-squad selection (click, Shift, number keys, drag box); orders go to every
  selected squad, moves spread side by side; Shift-click waypoints (simulation-side queue, saved, replayable, cleared
  by a new order or a blocked leg, save schema v2 with migration from v1); Ctrl + right-click context menu with the
  consequence of each option; rebindable keyboard (physical keys, conflict swap, reset) shown live on the HUD buttons.

- **Tactical depth (block 4)**: windows are breakable barriers (transparent, glass noise when smashed); plank
  barricades on any door/window (kits per squad, loud hammering, planks absorb damage first, removable); only infected
  with a reason break through (wanderers walk around); bites progress exposed → infected → critical → **turned**, a
  squad medic nearby halves the pace; **Brutamontes** (260 HP, barely staggers, smashes doors) and **Gritador** (shriek
  that draws everything around, with cooldown); a 4-level neighbourhood **alarm** (Calmo → Caçada) fed by loud noise,
  doubling runner reinforcements at Alerta; **hordes** of 7 (1 heavy) announced 20 s ahead, entering at the far edge and
  patrolling the avenues, on a timer or early at Caçada. Save schema v3 with migration.

- **Content pass (block 5)**: two new original maps (generated by `scripts/generate-campaign-maps.mjs`) and missions
  with their own texts (item, person, objectives, intel) in data; campaign with roster carry-over (the dead never return,
  wounds, infection stage and ammo persist; leaders are replaced), an interlude between missions (partial healing, ammo
  found, treatment doses from the mission item cure infections, untreated infections advance and critical survivors
  turn overnight), retries after a failure with whoever is left, progress saved locally; night missions with darker
  lighting; contextual tutorial (each hint once, when its situation first happens; can be turned off or replayed).
  Rescued civilians in panic now cling to a calm escort instead of freezing or following someone fleeing.

- **Finish pass (block 6)**: tick optimisation by pure memoisation (sound-absorption and opacity grids per barrier
  state, cached sound fields per origin/intensity, per-survivor field-of-view reuse) — final-state hashes of five full
  scripted missions are **bit-identical** before and after, average tick 7.1 → 3.0 ms; graphics quality option
  (Alta/Média/Baixa) and an FPS readout; multi-seed balance report; installable offline app (web manifest + service
  worker), loading screen, credits with the libraries and their licences, build id in the menu.

## Verification evidence (this build)

- `pnpm check`: typecheck ✓, ESLint ✓, production build ✓, Vitest **102/102** ✓ (plus the opt-in balance report).
- `pnpm e2e`: **11/11** Playwright ✓ — critical flow to a graded debriefing, stealth run, save/load, HUD + minimap fit
  at 1280×720 and 1920×1080, options, controls, both new missions, the campaign flow with carry-over, and the
  installable app (manifest, offline start after the first visit, credits with version); no console errors. The suite
  serves on a dedicated port (4317, `strictPort`, never reusing another server).
- **Determinism of the optimisation**: final-state hashes of five complete scripted missions (three maps, four routes)
  are bit-identical before and after block 6.
- **Tick performance** (Node, combat route, 8 survivors + up to 30 live infected), same machine, both measured with
  load average ≈ 10 from other apps: p95 **30 ms → 9.3–10.3 ms**, p50 3.3 → 2.2–2.4 ms; per-system average 7.1 → 3.0 ms.
  An idle machine was not available today; earlier idle runs were ~3× faster than loaded ones.
- **Balance** (scripted routes, 10 seeds each): [`docs/testing/balance.md`](docs/testing/balance.md) — 70–100 % wins;
  every loss is the escorted person dying, which a human protects better than a fixed script.
- **Frame rate**: headless Chromium only has software GL (SwiftShader, ≈ 5 FPS on Alta, ≈ 8 FPS on Baixa — not
  representative). The in-app browser could not open a WebGL context while hidden, so real-GPU FPS is unmeasured:
  use Opções → Vídeo → "Mostrar FPS" on the target machine.
- Screenshots: [`docs/testing/screenshots/`](docs/testing/screenshots/).
- Test ↔ requirement map: [`docs/testing/README.md`](docs/testing/README.md).

## Known issues / limitations (honest list)

- Art and audio are **original but procedural** (drawn/synthesized in code). Characters are small top-down
  silhouettes with a simple walk cycle; a hand-made or licensed (CC0) sprite set would raise fidelity further. No music
  score beyond the adaptive drone.
- Rendering performance was checked only in headless Chromium (software GL); no measured FPS budget on low-end GPUs yet.
- Route map and timeline are not saved: a mission continued from a quicksave shows only what happened after loading.
- Campaign balance is verified with scripted routes on canonical seeds; with heavy early losses the later missions get
  very hard by design, and scripted bots cannot adapt to a missing squad.
- The stealth acceptance is "no shot until the radio is on": the radio draws infected to the final hold by design,
  and on the canonical seed one walker reaches the zone, so the scripted run fires a few shots there.
- Survivors cannot climb through broken windows (only infected do), and there is no cure for infection yet.
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

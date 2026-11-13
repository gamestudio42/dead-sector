# TASKS

## NOW

- Playtest round 1 with 5–8 people (at least half new to the game), following
  [docs/testing/playtest.md](docs/testing/playtest.md): send `?playtest=1`, collect the exported logs and the
  questionnaire, merge with `node tools/playtest/report.mjs`, and write `docs/testing/playtest-round-1.md` with a
  keep / change / cut decision per hypothesis (H1–H7). This also covers the strategic campaign (stages 6.1 and 6.2)
  before stage 6.3 (ADR 0015).

## NEXT

- Publish the trailer (`node tools/promo/trailer.mjs`, ~30 s, 1080p, silent) on the studio's video channel and in the
  Snap Store listing, with the 30 s score cue from `node tools/music/render.mjs` (`dead-sector-trailer-30s.wav`) as
  its soundtrack.
- Phase 6.3: choose who deploys and how much ammo they take, roster by ID, recruits from the population.
- Phase 6.4: scavenging objective, operations for Avenida Norte and Mercadão Leste, variants by sector state.
- Phase 6.5: shelter upgrades (parts have no use yet), campaign difficulties, economy balance report.
- Measure frame rate on real GPUs (low-end laptop, integrated graphics) with the in-game FPS readout; tune "Média"
  and "Baixa" accordingly.
- Snap release: register `dead-sector` in the Snap Store and connect its Builds tab (CI already builds and smoke-tests it).
- Art upgrade, next step: give the Blender characters sculpted heads and hands, cloth folds and a few faces; add
  more walker variants (only 4 today), reusing `tools/sprites/bake_characters.py`.
- Campaign siege: when the shelter's infestation climbs, raise Cerco na Dom Bosco as a forced operation (ADR 0020).

## BLOCKED

- Real-GPU FPS: the dev machine resets by itself (20 of its last 24 boots since 2026-10-20 have no shutdown record, on AC and on
  battery, before and after this work), so measure on another machine until that is solved.

## DONE

- Defence objective (siege waves on a timetable, hold timer that pauses when the building is empty, radio locked
  until the hold is done, resupply cabinet) and the mission Cerco na Dom Bosco on the new map Escola Dom Bosco;
  save schema v4 (ADR 0020).

- Adaptive score synthesized at runtime: menu, campaign and tactical pieces in A minor, tactical layers driven by
  threat, alarm and extraction, Música volume slider, and an offline WAV renderer for trailers (ADR 0019).

- Character sheets rendered in Blender: 9 survivors and 7 infected looks, top-down 3D with an IK rig, outlined,
  checked for coverage and clipping, with the code-drawn sheets kept as fallback (ADR 0018). Two hardcoded
  Portuguese toasts (move mode, mute) now come from the locale files.

- Playtest kit: opt-in local playtest log (Opções → Playtest or `?playtest=1`; missions, deaths, abandons,
  interface use, FPS, campaign days) exported as JSON by the tester, a report script that merges the files, and a
  protocol with hypotheses and a questionnaire (ADR 0017).

- Promo: screenshots captured by hand-stepped frames, a gameplay cover for the studio site and the store, and a
  30-second trailer cut from real gameplay with EffectCraft title cards and captions.

- Combat readability: brighter blood, olive ichor and infected deaths measured against the street colour; wreck
  smoke drawn above the darkness so it shows at night (ADR 0016).

- Combat effects baked with EffectCraft (flash, sparks, blood, ichor, dust, splinters, glass, shriek, infected
  death) and ambient loops (wreck fire and smoke, radio beacon) and interface animations (horde, night, convoy, fallen sector, objective, rescue, bite, panic), with alpha and loop-seam checks, manifest and
  particle fallback (ADR 0016).

- Phase 6, stages 6.1 and 6.2: strategic layer with sector map, shelter, stock, daily turn, horde migration,
  evacuation goal and deadline; browser tests run in CI before publishing (ADR 0015).

- Desktop shell: Electron app in `apps/desktop` with `--smoke` and `--bench`, strict snap, Snap CI workflow (ADR 0014).

- Controls from playtest feedback: WASD camera by default (arrows as secondary), Shift pans faster, Q retreat,
  E hide, Z/X/C modes, V hold; second key per action, WASD/Setas presets, camera speed, migration of saved keys,
  live key names in tips and tooltips (ADR 0013).

- Block 6 — finish: tick memoisation (identical results, ~2.3× faster), graphics quality + FPS readout, balance report
  on 10 seeds, installable offline app, loading screen, credits, build id.

- Block 5 — content: maps Pátio da Ferrovia and Centro Velho, missions Sinal Fraco and Plantão Noturno (night), mission
  texts in data, campaign Setor Ferrugem with roster carry-over, interlude, retries and local persistence, contextual
  tutorial; rescued civilians follow a calm escort.

- Block 4 — tactical depth: breakable windows, plank barricades (kits, hammer noise, removal), infection that turns
  survivors (medic slows it), heavy and screamer infected, escalating alarm (4 levels, hysteresis) and announced roaming
  hordes; save schema v3 + migration; stealth acceptance redefined as "no shot until the radio".

- Block 3 — controls: multi-squad selection (Shift, drag box), Shift-click waypoint queue in the simulation (save v2
  - migration), Ctrl + right-click order menu, rebindable physical keys with conflict swap.

- Block 2 — premium interface: title screen with live backdrop, briefing (map, objectives, intel, roster, seed),
  compact collapsible HUD with tooltips, minimap, options (audio buses, captions, high contrast, reduced motion,
  lighting, blood, HUD scale), graded debriefing with timeline and route map; F5/F9 quicksave/load.

- Block 1 — presentation and game feel: procedural terrain, animated character sprites, soft fog, dusk lighting,
  particles/decals/camera shake/damage vignette, order markers, procedural spatial audio + adaptive drone, survivor
  barks, menu settings (volume, mute, blood, lighting); tests for cue/bark determinism and state immutability.
- Git repository initialized (`main`); vertical slice (milestones A–E) committed as the first commit.
- Milestone A: monorepo, pure sim package, fixed tick, seeded RNG, map/camera, squads + selection, tick/pause/seed tests.
- Milestone B: passability, A*, formations, sneak/move/sprint (speed, stamina, noise), route preview, ORDER_BLOCKED.
- Milestone C: LOS, fog of war, contact memory, acoustic field with doors/walls, walker/runner FSM, debug overlay.
- Milestone D: fire discipline, weapons/ammo/reload/melee, hit/damage/death-once, stress + panic hysteresis, leadership, HUD + log.
- Milestone E: pharmacy mission, civilian follower, extraction, win/partial/fail, debriefing, menu, save/load, E2E.

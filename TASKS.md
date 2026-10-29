# TASKS

## NOW

- (none — vertical slice delivered; awaiting playtest feedback)

## NEXT

- Block 4 — tactical depth: barricades and breakable windows with HP, infection that turns survivors, heavy and
  screamer infected, roaming hordes and an escalating alarm.
- Block 5 — content: contextual tutorial, two more maps, three linked missions with persistent losses (Phase 5).
- Block 6 — finish: multi-seed balance, GPU/FPS budget on low-end hardware, desktop package.
- Art upgrade: replace procedural character sheets with a hand-made or CC0 set (keep frame layout: 8 walk, attack, corpse).

## BLOCKED

- (none)

## DONE

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

# TASKS

## NOW

- (none — vertical slice delivered; awaiting playtest feedback)

## NEXT

- Block 2 — premium interface: collapsible/contextual HUD panels, minimap (explored area + known contacts, spec §13.1),
  options menu (audio buses, keybinds, colour-blind palette, sound captions), title screen and map briefing, richer debrief.
- Block 3 — controls: shift-queued waypoints, drag-box selection, right-click context menu, rebindable keys.
- Block 4 — tactical depth: barricades and breakable windows with HP, infection that turns survivors, heavy and
  screamer infected, roaming hordes and an escalating alarm.
- Block 5 — content: contextual tutorial, two more maps, three linked missions with persistent losses (Phase 5).
- Block 6 — finish: multi-seed balance, GPU/FPS budget on low-end hardware, desktop package.
- Art upgrade: replace procedural character sheets with a hand-made or CC0 set (keep frame layout: 8 walk, attack, corpse).

## BLOCKED

- (none)

## DONE

- Block 1 — presentation and game feel: procedural terrain, animated character sprites, soft fog, dusk lighting,
  particles/decals/camera shake/damage vignette, order markers, procedural spatial audio + adaptive drone, survivor
  barks, menu settings (volume, mute, blood, lighting); tests for cue/bark determinism and state immutability.
- Git repository initialized (`main`); vertical slice (milestones A–E) committed as the first commit.
- Milestone A: monorepo, pure sim package, fixed tick, seeded RNG, map/camera, squads + selection, tick/pause/seed tests.
- Milestone B: passability, A*, formations, sneak/move/sprint (speed, stamina, noise), route preview, ORDER_BLOCKED.
- Milestone C: LOS, fog of war, contact memory, acoustic field with doors/walls, walker/runner FSM, debug overlay.
- Milestone D: fire discipline, weapons/ammo/reload/melee, hit/damage/death-once, stress + panic hysteresis, leadership, HUD + log.
- Milestone E: pharmacy mission, civilian follower, extraction, win/partial/fail, debriefing, menu, save/load, E2E.

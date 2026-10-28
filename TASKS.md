# TASKS

## NOW

- (none — vertical slice delivered; awaiting playtest feedback)

## NEXT

- Minimap with explored area and known contacts (spec §13.1).
- Original sprite set (idle/walk/run/attack/hurt/die) and original audio with sim-driven sound events.
- Order UX: shift-queued waypoints, drag-box selection, context tooltips over the map.
- Heavy infected (door/barricade damage) and player-built barricades.
- Night variant with flashlight cones (survivor night range already in rules).
- Phase 5: two more maps, three linked missions, persistence of survivors between missions.

## BLOCKED

- (none)

## DONE

- Git repository initialized (`main`); vertical slice (milestones A–E) committed as the first commit.
- Milestone A: monorepo, pure sim package, fixed tick, seeded RNG, map/camera, squads + selection, tick/pause/seed tests.
- Milestone B: passability, A*, formations, sneak/move/sprint (speed, stamina, noise), route preview, ORDER_BLOCKED.
- Milestone C: LOS, fog of war, contact memory, acoustic field with doors/walls, walker/runner FSM, debug overlay.
- Milestone D: fire discipline, weapons/ammo/reload/melee, hit/damage/death-once, stress + panic hysteresis, leadership, HUD + log.
- Milestone E: pharmacy mission, civilian follower, extraction, win/partial/fail, debriefing, menu, save/load, E2E.

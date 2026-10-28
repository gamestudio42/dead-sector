# Architecture overview

```
apps/web (Phaser + DOM HUD)            packages/sim (pure TS)                    packages/content
  input ──commands──▶ GameSimulation.enqueue ─▶ advanceTick(world, state, cmds, rng)   JSON + Zod
  render ◀── reads state/snapshots, events     applyCommands → updatePerception           ▲
  FixedStepClock (pause, 1×/2×)                → updateNoise → reinforcements           │ validated
                                               → decideZombies → decideSurvivors        │ at boot
                                               → moveActors → resolveCombat
                                               → resolveDamageAndInfection → interactions
                                               → updatePsychology → evaluateObjectives → tick++
```

- **Time**: 100 ms fixed ticks. The host `FixedStepClock` converts wall time to a number of ticks; pause yields zero
  ticks; 2× yields twice the ticks. Rendering interpolates positions between the previous and current tick.
- **World vs state**: `World` is static data derived from content (tiles, rules, door index). `GameState` is all
  mutable, serializable data (see ADR 0002).
- **Perception**: survivors cast vision rays (fog) and test LOS per infected; the player only sees infected that a
  squad member currently sees, plus timestamped last-known markers. Infected sense survivors with their own range,
  FOV, concealment modifiers and LOS, and hear noises through the acoustic field. They never read a target's position
  unless it is currently perceived.
- **Events**: every tick produces `state.events` (`SimEvent` with id, tick, type, payload); a filtered `eventLog`
  feeds the HUD. Events never mutate state.
- **Spatial**: supercover ray traversal (`Raycast.ts`), A* with pooled typed arrays (`Pathfinding.ts`), bucket
  hashing (`SpatialHash.ts`), circle-vs-tile collision with revert-on-penetration (`Movement.ts`).

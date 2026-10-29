# 0010 — Barriers, turning, special infected, alarm and hordes

## Context

Block 4 adds pressure and choices without breaking determinism, saves or the two canonical routes.

## Decision

- **Windows are `Door` entities of kind `window`** on the same per-cell barrier index: transparent, never opened by
  survivors, breakable by infected (glass noise). Reusing the door machinery keeps one code path for bashing,
  pathfinding costs and rendering. Barricades are an HP layer on any barrier (`Door.barricade`) that blocks everyone and
  absorbs damage first; they cost a per-squad kit and make periodic hammering noise, so they are a trade, not a free
  wall. Interacting with a barricaded door removes the planks.
- **Only motivated infected break barriers.** Wandering/idle infected path with `zombieCalm`, which treats closed
  barriers as walls. Without this, wanderers smashed windows across the map within minutes, opening new lanes and
  breaking the stealth design.
- **Turning** happens in the sim (exposed → infected → critical → turned). The survivor dies once (`ACTOR_KILLED`
  with `cause: 'turned'`) and a walker spawns on the spot (`SURVIVOR_TURNED`). A nearby medic scales the clock
  deterministically (fractional ticks, no RNG).
- **Special infected are data**: `staggerFactor`, `screamIntensity`, `screamCooldownSeconds` with defaults in the zombie
  schema; heavy/screamer are just content plus small hooks (stagger scaling, scream on first sight).
- **Alarm** is a decaying 0–100 accumulator fed by loud noises (not footsteps or ordinary groans), with 4 levels and
  hysteresis (rises at a threshold, falls 5 points below it). It feeds back into reinforcements (more runners) and
  hordes. **Hordes** are scheduled (timer or Caçada with a minimum gap), announced `warningSeconds` ahead, spawn only at
  an entry that is out of sight and far from the squads, and patrol a data-defined route; members keep their individual
  FSM and rejoin the crowd's waypoint when calm.
- Save schema **v3** with a migration; old saves keep their windows solid because they have no window entities.
- The **stealth acceptance** changed from "zero shots" to "zero shots until the radio is on": the radio is designed to
  pull infected to the final hold, and with the new placement one walker reaches it on the canonical seed.

## Consequences

- Balance is tuned for seed 1337 (both scripted routes win); other seeds are playable but unverified.
- Hordes and screams make the combat route meaningfully harder; the combat acceptance still wins, losing members.

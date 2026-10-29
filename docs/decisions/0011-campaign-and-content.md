# 0011 — Campaign carry-over, mission texts in data, tutorial

## Context

Block 5 (spec Phase 5) needs more missions, linked progress with persistent losses and a contextual tutorial, without
rewriting the objective system or changing the deterministic tick.

## Decision

- **Missions reuse the five-step objective structure** (enter area → take item → rescue person → radio → hold) with
  different maps and **texts in data** (`mission.texts`: item, person, objective names, intel). The client applies
  them to its PT-BR dictionary when a mission scene starts, so every string that names the item or person follows.
- **Campaign logic is pure and lives in the sim package** (`campaign/Campaign.ts`): `newCampaign`, `carryOver`,
  `applyMissionResult`. `createMissionState` accepts a carry-over: only living survivors deploy, with their health,
  infection stage and ammo; a fallen leader is replaced by the best remaining leader. The tick pipeline is unchanged.
- **Between missions**: partial healing, partial ammo resupply, treatment doses earned from the mission item cure the
  most advanced infections first, untreated infections advance one stage and critical survivors turn. Losses persist
  for every outcome; failure means retrying the same mission (seed advances per attempt) with whoever is left.
- The campaign is stored locally (IndexedDB/localStorage, like saves); a run is folded into it exactly once (keyed by
  mission, seed and final tick) even if the debrief screen is shown again.
- **Tutorial**: `tipsForEvents` maps sim events to one-time hints (pure, tested); seen ids are a per-viewer setting.
- Playtesting with chained routes exposed two escort problems, fixed in the sim: a panicked rescued civilian froze in
  the open, and followed an escort member who was fleeing in panic. Rescued civilians now cling to a calm escort.

## Consequences

- New mission types (defence, pure scavenging) will need objective kinds beyond the five-step template.
- The campaign test proves it can be won by scripted routes (stealth first, then the mission routes), not that every
  roster state is winnable; heavy early losses make later missions very hard by design.

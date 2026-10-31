# 0015 — Strategic campaign layer

## Context

Spec Phase 6 asks for a strategic map, shelter, resources, a strategic turn and mission choice, where operations change
the world persistently and decisions have explicit costs. The linear campaign healed and rearmed everyone automatically,
so nothing was decided between missions. There are three missions and three maps so far.

## Decision

- **Pure, seeded and separate from missions**: `campaign/Campaign.ts` has its own RNG in `CampaignState`. Mission ticks
  are unchanged, and a mission without a multiplier produces the same state as before.
- **One operation per day, and time only passes in `endDay`.** The player returns from a mission, can still treat people,
  then ends the day. Otherwise a critical survivor could turn before the player had any chance to act.
- **Victory is evacuation against a deadline**: successful operations in the railyard move people out of the shelter.
  Defeat comes from the deadline, the shelter falling, the way out being lost or nobody left to fight.
- **Costs are visible before they are paid**: treatment spends medicine by hand, squads rearm from a finite stock, food
  is eaten daily and shortage costs shelter people. Second runs pay half.
- **Migration** moves infected along connections towards emptier sectors and towards noise heat left by missions.
  A loud operation can undo a secured sector overnight, which is the strategic price of gunfire.
- **Infestation changes the mission**: reinforcements scale with the sector on the day, ahead of the variants in stage 6.4,
  so the risk the screen shows is real.
- **Old saves migrate**: missions already done in a version 1 campaign become secured sectors.

## Consequences

Avenida Norte and Mercadão Leste only move infected until stage 6.4, and parts have no use until stage 6.5. Stock and
migration values are provisional: a scripted run proves the campaign can be won, not how hard it is for a person.
Repeating the same missions may feel monotonous; the playtest of stage 6.2 should answer that.

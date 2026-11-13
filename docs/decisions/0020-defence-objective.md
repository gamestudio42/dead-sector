# ADR 0020 — Defence objective and the Cerco na Dom Bosco mission

**Status:** accepted — 2026-11-13

## Context

Every mission followed one shape: get in, take an item, rescue a person, call the extraction and hold for 20 s.
Barricades (ADR 0010) mattered only now and then. Players had no reason to prepare a position and then fight
for it, which is the other half of the genre. `TASKS.md` listed "more objective types (defence)".

## Decision

- **Defence is an optional block in a mission's objectives** (`objectives.defence`): the area to hold, when the
  siege starts, its warning, how long to hold and a list of waves. A mission that has it gets a sixth objective,
  `holdPosition`, between the rescue and the radio (`objectiveOrder(mission)`). The other missions are unchanged.
- **The siege runs on a timetable, not on noise.** `systems/Siege.ts` emits `SIEGE_INCOMING` `warningSeconds`
  before the siege starts. It then spawns each wave at its entries, split across the open ones.
  - Every infected in a wave investigates a seeded cell inside the defended area. It breaks any door, window or
    barricade in its way.
  - A wave whose entries are in sight, or have a squad member nearby, retries every 2 s. Infected never appear in
    front of the player.
- **The hold timer only runs while a squad member is inside the area** and pauses otherwise; it does not reset.
  `DEFENCE_HOLD_CHANGED` announces each change, so the player knows that leaving costs time. When the hold is done,
  `DEFENCE_COMPLETED` fires and the radio works. Calling the convoy before then is blocked with `requiresDefence`.
- **The cabinet can resupply.** `cabinet.grantsKits` adds plank kits to every squad. `cabinet.grantsRounds` adds
  reserve rounds to every armed squad member. Both default to 0.
- **First mission: Cerco na Dom Bosco**, on a new map, `escola-dom-bosco`. The shelter school of the campaign
  stands in a fenced lot with four gates and streets on all sides.
  - The building has 5 doors (one locked) and 10 windows. The squads start with 2 kits each and the storeroom adds
    2 more each, so they can cover only about half of the openings.
  - The siege starts at 2:30 and must be held for 3 minutes. Five waves arrive along the four avenues, 37 infected
    in all, with runners and brutes.
- **Save schema v4.** The mission state gains the siege and hold fields, and the migration from v3 fills in "no
  defence".

## Consequences

- The scripted route barricades the west side, the back door, two north windows, the south-west room and the
  front doors, then holds the hall, which has no windows. It wins 10/10 in the balance report, with 0.6 squad
  deaths on average. The same plan holding the south-west room with the teacher won 7 of 12 seeds in development,
  so the choice of position matters, which is the point.
- The HUD shows a countdown to the siege, a hold banner and a toast for each wave. The defended area is drawn in
  amber on the map, the minimap and the briefing. The music treats a siege like the extraction.
- The playtest log records `wave`, `defenceHold` and `defence`, so round 1 can see where people leave the building.
- The campaign does not use the mission yet. The shelter sector could raise a siege when its infestation climbs,
  but that belongs to stages 6.3–6.5.

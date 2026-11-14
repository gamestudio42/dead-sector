# ADR 0023 — Scavenging objective, two new operations and sector variants

**Status:** accepted — 2026-11-14

## Context

Stage 6.4 of the strategic campaign (ADR 0015). Two of the six sectors, Avenida Norte and Mercadão Leste, had no
operation; they only moved infected around. Every operation paid a fixed reward, so how much a squad brought home did
not depend on what it did on the map. A mission also played the same whether its sector was nearly clear or overrun;
only the reinforcement budget followed the infestation.

## Decision

- **Scavenging is an optional block in a mission's objectives** (`objectives.scavenge`): a list of supply caches,
  each on a walkable cell with its own loot (food, medicine, rounds, parts), how long a search takes, how loud it is
  and how many caches the radio needs.
  - A mission that has it gets the objective `scavengeSupplies` before the radio (`objectiveOrder(mission)`). Calling
    the transport earlier is blocked with `requiresScavenge`.
  - A search is a timed interaction like the cabinet, interrupted by threats. When it ends, the cache is recorded in
    `mission.cachesSearched`, a noise of `searchNoise` is heard around it and `CACHE_SEARCHED` reports the count.
  - **Everything searched comes home** on a successful or partial extraction, at full value every time (the sector
    reward is still halved on later runs). The required caches open the radio; the others are the choice between
    more supplies and more noise. A failed run brings nothing back.
- **Two operations on two new maps**, both 80×80 and built from blocks by `tools/maps/build.mjs`:
  - **Comboio Parado** (Avenida Norte): a supply convoy stalled on the avenue the hordes come down. Five caches: three
    trucks, a bus and a gas-station shop; three open the radio. The toolbox is in a mechanic's garage and the driver
    in its back office; the exit is the south parking lot.
  - **Feira Fantasma** (Mercadão Leste): a covered market with four rows of stalls. Six stalls; three open the radio.
    The powdered milk is in the management office, the vendor in the cold room, and infected wander between the
    shelves.
- **Variants by sector state.** `operationVariant` reads the sector's status on the day:
  - an infested sector is **overrun**: 35% more infected at the start and the first horde 25% sooner;
  - a secured sector is **quiet**: 30% fewer infected and the first horde 30% later;
  - a contested sector and the shelter's siege play as designed.
    The variant goes into `createMissionState` next to the reinforcement multiplier. The sector panel names it when it
    is not the standard one.
- **Save schema v5.** The mission state gains `cachesSearched`; the migration from v4 fills in an empty list.

## Consequences

- Avenida Norte borders the shelter, so it can be raided from day one, but it starts at 70% infestation and plays
  overrun. The scripted routes win 10/10 on the standard maps (1.0 and 0.3 squad deaths on average) and 10/10 and
  9/10 overrun, with more losses. Both routes return fire instead of firing at will: shooting freely raises the alarm
  to "Caçada" within half a minute and brings a horde down the avenue.
- The market route goes back out by the west door it came in, not the south doors. Leaving by the south street, past
  its screamer, lost the vendor on 2 of 10 seeds.
- The HUD counts searched caches on the objective, the map, minimap, briefing and debrief mark the caches not yet
  searched, and the playtest log records each search, so round 1 can see whether people go for more than three.
- Loot values and variant factors are first guesses, checked only by scripted runs, like the rest of the economy
  (stage 6.5).

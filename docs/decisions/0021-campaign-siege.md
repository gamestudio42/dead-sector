# ADR 0021 — The campaign besieges the shelter

**Status:** accepted — 2026-11-13

## Context

ADR 0020 added the defence objective and the mission Cerco na Dom Bosco, played at the campaign's shelter school, but
only as a single mission. In the campaign the shelter's infestation already rose every night as infected flowed in
from its neighbours. Nothing happened until it reached 100 and the campaign was lost. The player saw a number creep
up and had no way to fight for the school.

## Decision

- **A campaign may define a siege** (`siege` in the campaign JSON): the mission to play, the shelter infestation that
  raises it (`raisedFrom`), the infestation change by outcome and the people lost in a breach (`breachLoss`). Content
  validation checks that the mission exists, has a defence objective and only fields survivors of the roster.
- **The siege is raised at night.** After migration, if the shelter is at or above `raisedFrom`, the campaign gets
  `siegePending` and a `siege-raised` notice. Setor Ferrugem raises it from 35%. Left alone, the shelter gets there
  around day 7 or 8, sooner when noisy operations draw infected.
- **While the siege is pending it is the only operation.** The shelter node offers the siege mission
  (`operationMissionId`) and every other sector is blocked with `siege`. The strategic screen shows a banner, marks
  the shelter "Sitiada" and warns that ending the day costs people.
- **Outcome:**
  - Held (success or partial): the shelter's infestation drops by 30 (20 when partial).
  - Lost, or the day ended without fighting: the infected break in, `breachLoss` people of the shelter (3) are lost
    and the infestation rises by 10.
  - In both cases the siege is over and `sieges` counts it. A shelter that climbs back can be besieged again.
- **The teacher already lives in the shelter.** Bringing her through adds nobody. If she dies, the shelter loses one
  person.
- **A siege adds no noise heat.** The fight is at home. If its noise drew infected from the neighbours, each siege
  would raise the next one.
- **Campaign save version 4** adds `siegePending` and `sieges`; older saves load with no siege.

## Consequences

- The shelter's infestation now leads to a fight the player can win, and choosing noisy operations has a cost at
  home.
- The breach loss and thresholds are provisional, like the rest of the campaign economy, until playtest round 1 and
  the economy report of stage 6.5.
- Unit tests cover raising, blocking, both outcomes, skipping and migration. An e2e test plays the siege from the
  strategic map through the debrief.

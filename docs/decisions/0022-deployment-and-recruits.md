# ADR 0022 — Campaign deployment and recruits

**Status:** accepted — 2026-11-14

## Context

Stage 6.3 of the strategic campaign (ADR 0015). Until now every operation sent the same eight survivors in the same two
squads. The wounded and the infected went too, and each squad had the rounds it had been rearmed with at night. The
shelter's population only counted toward evacuation and food. The roster was keyed by survivor template, so it could
not hold two people built from the same template.

## Decision

- **The roster is known by id.** A roster entry has its own `id`, `name` and `squadId`, plus the `templateId` that
  gives its stats, weapon and look. The original eight keep their template ids as ids. Campaign save version 5
  derives the id, name and squad from the template for older saves.
- **The campaign briefing chooses who goes.**
  - Each living survivor is set to a mission squad or to "stays at the shelter". A squad takes as many as the
    mission's slots.
  - The choice is kept for the next operation.
  - `createMissionState` deploys the carry-over by squad, under the roster id and name. When two template leaders
    end up in one squad, only the first leads; a squad with no leader still promotes its best member.
- **Extra rounds.** Each squad may draw 0, 12 or 24 extra rounds per armed member from the stock. The cost is shown
  before deploying, and the rounds leave the stock when the squads go. Rounds above a full load that come back
  unfired return to the stock at night (`rounds-returned`).
- **Recruits.** Once a day, the shelter can turn one person of its population into a fighter.
  - The cost: one fewer person to evacuate, and their rounds come from the stock. They still eat the same.
  - Recruits use the `recruit` template (pistol, average stats, a new Blender sheet with a neutral armband). They
    take names from the campaign's list, and join the smaller squad with room or stay at the shelter.
  - The roster is capped at 12 living fighters.
- Deployment and recruiting are pure functions in `campaign/Campaign.ts` (`deploy`, `deploymentBlockReason`,
  `recruit`, `recruitBlockReason`). The interface only shows their reasons.

## Consequences

- Leaving the wounded or the infected at home, and spending ammo on a hard operation, are now choices with a visible
  cost. So is arming people who would otherwise be evacuated.
- Recruits share one set of stats. Individual traits, veterans and specialists remain for later.
- The playtest log records `recruit` and `deploy`.
- Values (one recruit a day, steps of 12 rounds, 12 fighters) are provisional, like the rest of the economy, until
  the stage 6.5 report.

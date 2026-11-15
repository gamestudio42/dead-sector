# ADR 0024 — Shelter upgrades, campaign difficulties and the economy report

**Status:** accepted — 2026-11-14

## Context

This is stage 6.5, the last stage of the strategic campaign (ADR 0015). Three gaps were open:

- Parts piled up in the stock with no use.
- Every campaign was played the same way.
- Stock values had only been checked one mission at a time, never across a whole campaign.

## Decision

- **Shelter upgrades** (`upgrades` in the campaign):
  - Each is bought once with the stock, mostly parts, and lasts for the rest of the campaign. Building one does not
    take the day's operation.
  - Setor Ferrugem has four upgrades, 12 parts in all:

    | Upgrade           | Cost                | Effect                                                                                |
    | ----------------- | ------------------- | ------------------------------------------------------------------------------------- |
    | Horta no pátio    | 3 parts, 4 food     | +2 food every night, before the shelter eats                                          |
    | Enfermaria        | 3 parts, 1 medicine | +15% of max health healed every night                                                 |
    | Oficina de tábuas | 2 parts             | +1 plank kit per squad on every operation                                             |
    | Muro reforçado    | 4 parts, 10 rounds  | the siege is raised 15 points of infestation later, and a breach costs 2 fewer people |

  - Building an upgrade adds a `built` notice. The garden adds a `harvest` notice each night.
  - `missionModifiers` joins the sector variant (ADR 0023) and the workshop's kits into what the operation's mission
    receives.
- **Campaign difficulties** (`difficulties` in the campaign), chosen in the menu when a campaign starts:

  |                          | Fácil   | Normal  | Difícil |
  | ------------------------ | ------- | ------- | ------- |
  | Starting stock           | ×1.4    | ×1      | ×0.75   |
  | Deadline                 | 14 days | 12 days | 10 days |
  | Daily growth of infected | ×0.5    | ×1      | ×1.5    |
  | Reinforcements           | ×0.8    | ×1      | ×1.25   |
  - Normal is the campaign as it was.
  - The shelter screen shows the difficulty, and its deadline counts the right number of days.
  - `operationReinforcements` combines the reinforcement multiplier of the sector and of the difficulty.
  - A new campaign after the end keeps the same difficulty.

- **Campaign save version 6**: the campaign records `difficultyId` and `upgrades`. Older saves load on normal with
  nothing built.
- **Economy report** (`pnpm economy`, which writes `docs/testing/economy.md`):
  - A fixed policy plays 8 whole campaigns per difficulty with the scripted mission routes. Each day it treats, builds,
    recruits and operates, and it rests when the squads are short of rounds.
  - The report gives the outcomes, rounds fired per operation and the stock day by day. It is opt-in like the balance
    report, and takes about a minute and a half.

## Consequences

The first report shows where the economy breaks. Its numbers come from fixed routes and a simple policy, so they say
where to look, not how a person fares:

- **Rounds are the binding resource.** The Sinal Fraco route fires about 230 rounds per run, more than the whole
  starting stock (140). After two or three operations the squads go out dry and die. Survivors lost and "no fighters"
  endings follow from that.
- **Food is loose.** The stock stays between 10 and 50 throughout, so the garden matters less than it should.
- **Parts are scarce.** The policy builds 1.5 upgrades per campaign on average, so the costs are about right for having
  to choose.
- **Difficulty barely changes the policy's win rate** (2/8 on all three). Its outcomes are decided by the fixed routes
  running out of rounds. The other levers move as designed: stock, deadline and sieges.
- **The policy never plays the scavenging runs.** It always picks the pharmacy and the railway, so the report covers
  three missions only.

These findings go to TASKS as the next tuning step. Rebalance the rounds (cheaper routes or more ammo in rewards) and
check against the playtest first: a person sneaks more than the scripted routes do.

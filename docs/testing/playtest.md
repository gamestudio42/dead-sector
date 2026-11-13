# Playtest kit

How to run a round of human playtests, what the game records, and how to turn the results into
keep / change / cut decisions. The studio rule is in
[`.gs42/standards/rules/design/playtest.md`](../../.gs42/standards/rules/design/playtest.md).

Nobody outside the team has played Dead Sector yet. Balance so far comes from scripted bots
([balance.md](balance.md)), which cannot tell whether a person understands the game, enjoys it or
wants to come back. This round answers that first.

## What the game records

Opções → **Playtest** → _Registrar playtest_, or open the game with `?playtest=1` in the link. The
log stays in the browser's local storage. Nothing is sent anywhere: the tester exports a `.json`
file and sends it by hand. `?playtest=0` turns it off. Decision record:
[ADR 0017](../decisions/0017-local-playtest-log.md).

| Entry                                                                    | When                                      | Main fields                                                                 |
| ------------------------------------------------------------------------ | ----------------------------------------- | --------------------------------------------------------------------------- |
| `session`                                                                | page load (log on)                        | build, language, viewport, pixel ratio, touch                               |
| `menu`                                                                   | a main-menu choice                        | `choice` (mission id, campaign, continue, options…)                         |
| `briefing`                                                               | deploy or back                            | mission, `seconds` spent on the briefing, seed                              |
| `missionStart`                                                           | the tactical scene opens                  | mission, seed, campaign or not, from a save or not, squad snapshot          |
| `objective`, `extraction`                                                | an objective completes, the radio starts  | tick                                                                        |
| `death`, `bitten`, `turned`, `panic`                                     | the event happens                         | survivor id, template (role), civilian or not, cause, cell                  |
| `orderBlocked`, `orderRejected`                                          | the sim refuses or cannot finish an order | order type, reason                                                          |
| `alarm`, `horde`                                                         | the alarm level changes, a horde enters   | level, size                                                                 |
| `sample`                                                                 | every 30 s of game time                   | FPS, alive, live infected, alarm, ammo, average stress, objectives done     |
| `missionEnd`                                                             | the mission ends                          | status, reason, final snapshot, sim stats, real seconds, interface counters |
| `missionAbandon`                                                         | the tester leaves early                   | `how` (menu, restart, load, closed tab), the same fields as the end         |
| `debrief`, `debriefChoice`                                               | the debriefing shows / a button           | grade, outcome; again, menu or campaign                                     |
| `campaignStart`, `operation`, `dayEnd`, `campaignEnd`, `campaignRestart` | campaign screen                           | day, evacuated, population, roster, stock, whether the day had an operation |

Interface counters per mission: pauses and real time paused, speed toggles, orders by type,
movement modes, fire-discipline changes, order menu, quicksave/load, options opened, tips offered (each once).

Not recorded: names typed anywhere other than the optional tester label, the browser's user agent,
IP or location, keystrokes, mouse paths, screenshots.

## Running a round

**Who.** 5–8 people. At least half have never seen the game; at least two do not usually play
tactics games. Note for each one whether they know Close Combat, Door Kickers or similar games.

**Build.** One build for the whole round. Write its id (shown on the main menu, e.g.
`0.1.0+5d5d6ec`) in the notes, and send the link with `?playtest=1`:
`https://gamestudio42.github.io/dead-sector/?playtest=1`.

**Session (45–60 min).**

1. Give no instructions beyond "play as you would at home, think out loud". Do not explain controls.
2. 0–25 min: free play from the main menu. The observer only writes, never helps. If the tester is
   stuck for 3 minutes, note the time and what they tried, then give the smallest hint.
3. 25–50 min: ask them to start the campaign and play until they want to stop.
4. Last 10 min: questionnaire (below), then the tester exports the file in Opções → Playtest.

Remote testers do the same alone and record their screen with the voice on if they agree.

**Observer sheet.** One line per moment: time, what happened, what the tester said (quote), what
they tried next. Observation and interpretation in separate columns.

| Time | What happened | Quote | Interpretation (later) |
| ---- | ------------- | ----- | ---------------------- |

## Hypotheses for round 1

Each one says what we watch and what result would make us act. Thresholds are for a round of
5–8 people. A round like that can show that something is broken. It cannot set a balance number.

| #   | Hypothesis                                                                | Pillar / loop beat                 | Watch                                                              | We act if                                                                |
| --- | ------------------------------------------------------------------------- | ---------------------------------- | ------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| H1  | A new player finishes the first mission (any result) in the first sitting | onboarding / during                | funnel, `missionAbandon` before the first `missionEnd`             | fewer than half of the new players finish it                             |
| H2  | Players understand why each survivor died                                 | readability, imperfect information | Q4, observer quotes, death causes                                  | most can't say why on at least one death                                 |
| H3  | Noise changes how people play after the first horde or alarm              | sound as a resource                | movement modes and sprint/sneak counts after the first `alarm`, Q5 | sneak is never used, or nobody mentions noise                            |
| H4  | The briefing is read and used                                             | before the operation               | `briefing.seconds`, Q3                                             | median under 15 s, or players miss an objective that is on the briefing  |
| H5  | People who start the campaign want to come back                           | persistence, campaign              | days ended, Q7–Q8                                                  | most stop before day 3, or rate "come back" 3 or lower                   |
| H6  | The game runs well on testers' machines                                   | delivery                           | `sample.fps`                                                       | median FPS under 45, or any tester under 30 most of the time             |
| H7  | The order interface is not the obstacle                                   | readability and interaction        | `orderBlocked`, order menu use, stalls of 3 min                    | blocked orders the player did not expect, or repeated stalls on controls |

## Questionnaire (player-facing, Portuguese)

Escala de 1 (nada) a 5 (muito) onde indicado.

1. Você já jogou jogos de tática em tempo real (Close Combat, Door Kickers, XCOM…)? Quais?
2. Nos primeiros 5 minutos, você entendeu o que tinha que fazer? (1–5) O que confundiu?
3. Você leu o briefing antes de começar? Ele ajudou? (1–5)
4. Pense na última pessoa da equipe que morreu. Por que ela morreu?
5. O barulho mudou o jeito como você jogou? Como?
6. Qual foi o momento mais tenso? E o mais frustrante?
7. Quanto você gostou de jogar? (1–5)
8. Quanto você gostaria de voltar e jogar de novo amanhã? (1–5) Por quê?
9. Se pudesse mudar uma coisa no jogo, qual seria?
10. Você pagaria por este jogo? Quanto acharia justo?

## Merging the results

Put every exported file in one folder (outside the repository: the files belong to the testers)
and run:

```bash
node tools/playtest/report.mjs ~/playtests/round-1 --out ~/playtests/round-1/report.md
```

The report shows each tester, the funnel (opened → deployed → objective → finished → won →
campaign → day 6 → campaign end), each mission's results, abandons and real time, how missions
ended and where people left them, death causes, roles and places, blocked orders, interface use,
briefing time, FPS and campaign progress. It counts things. It does not say why.

## From results to decisions

For each hypothesis write, in `docs/testing/playtest-round-N.md`:

1. Who played (number, new or not, genre experience) and the build id.
2. Observations: numbers from the report and quotes, with no explanation.
3. Interpretation, in separate sentences.
4. Decision: **keep**, **change again** or **cut**. A change names the one variable that moves,
   its before and after value and the file that owns it.

Never call a hypothesis confirmed from a session that did not happen, or from the scripted bots.

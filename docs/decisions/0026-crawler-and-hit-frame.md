# ADR 0026 — Crawler infected and a hit frame

**Status:** accepted — 2026-11-15

## Context

The specification (§9.2) lists a crawler for 1.0: 45 HP, 0.5 m/s, short range, hides in terrain. The game shipped
walkers, runners, heavies and screamers only. Hits had no pose either. The simulation already staggers an infected
when it is hit (`staggerUntil`, scaled by `staggerFactor`), but the sprite kept walking, so a hit showed only as a red
flash. ADR 0025 named both as the next art step.

## Decision

- **Crawler (`crawler`, Rastejante).** An infected that lost its legs above the knee. It has 45 HP, moves at
  0.5 m/s, bites on 45 % of its hits and barely damages doors. The new optional zombie field `spotRangeMeters` sets how
  close a survivor must be to notice it. For the crawler that is 5 m, because it moves low, under cars and debris.
  Perception skips it beyond that range, so it stays off the contact list and survivors do not shoot it until it is
  close. One walker zone became a crawler zone in each of Plantão Noturno, Comboio Parado, Feira Fantasma and Sinal
  Fraco. Sinal Fraco gets one crawler instead of two, because with two the scripted route failed its canonical seed.
- **Crawler art.** The bake lays the rig face down with its head forward. The thighs end in ragged stumps. In the
  walk cycle one arm reaches ahead and plants while the other pulls the body forward. On the attack frame it rears up
  with both arms forward. The code-drawn fallback has a prone version too.
- **Hit frame.** Every sheet gains frame 10, so a sheet is now 11 frames. A survivor's frame is a flinch: the torso
  twists away and the arms come up. An infected's frame is a stagger: it rocks back, the head snaps back and the arms
  fly out. The renderer shows the stagger while `tick < staggerUntil`, so it lasts exactly as long as the simulation's
  stagger, which is short for a heavy. A survivor flinches for 220 ms after `ACTOR_INJURED`.

## Consequences

- 22 sheets. A full bake takes about 1 min 50 s on the CPU.
- `docs/testing/screenshots/crawler-and-stagger.png` shows a crawler closing on Alfa and a walker staggering.
- Four missions changed, so the reports were generated again:
  - In `docs/testing/balance.md`, Plantão Noturno drops from 10/10 to 8/10: on two seeds the crawler reaches the
    civilian. Sinal Fraco goes from 8/10 to 9/10, since it now has one crawler where it had two walkers.
  - In `docs/testing/economy.md`, the raids policy wins 3–4 of 8 campaigns instead of 2, because the railway route
    is a little lighter. The Comboio Parado scavenging run now fires about 310 rounds.
  - The scripted campaign tests still pass.
- `pnpm balance` now yields to vitest between runs and has an explicit timeout, like `pnpm economy`. Before, it
  failed after writing its report.
- No idle turn yet, and only one crawler look.

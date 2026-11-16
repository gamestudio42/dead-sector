# ADR 0027 — Idle look-around, reload pose and crawler looks

**Status:** accepted — 2026-11-16

## Context

After ADR 0026 a character that stood still showed one frozen frame, apart from a slight breathing scale. A survivor
changing magazines looked the same as one aiming. Only one crawler look existed, so every crawler was the same body.
ADR 0026 named these as the next art step.

## Decision

- **Three more frames.** Every sheet grows from 11 to 14 frames:

  | Frame | Survivor                                                                                   | Infected                                                   |
  | ----- | ------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
  | 11    | idle, looking left: the head turns and the shoulders and gun follow a little               | the head lolls to the left and the shoulders sway after it |
  | 12    | the same, looking right                                                                    | the same, to the right                                     |
  | 13    | reload: the gun comes in to the chest, the eyes go down, the support hand holds a magazine | repeats the idle pose (unused)                             |

  A crawler's glance turns only its head. Melee and unarmed survivors repeat their idle pose on frame 13.

- **When they play.**
  - An actor that has stood still for 2 s glances around. Most of the time it looks straight ahead; then it looks
    left for about a second, and later right. The timing is offset per actor, so a group does not turn in step.
  - Panicked survivors do not glance around, and neither do infected that are pursuing or attacking.
  - A survivor shows the reload pose while `weapon.reloadRemaining > 0` and it is not moving.
  - The hit and attack poses still win over both.
- **Crawler looks.** The looks file now has `crawlers`, a list like `walkers`. The second crawler wears an office
  shirt with a buzz cut. `zombieTextureKey` spreads crawlers over the list with the same id hash as walkers.

## Consequences

- 23 sheets, about 1.66 MB in all, up from 22 sheets at about 1.26 MB.
- `docs/testing/screenshots/idle-look-and-reload.png` shows the squad glancing around while a crawler is shot.
- The code-drawn fallback twists the torso for the glances and pulls the gun in for the reload.
- No textures or sculpted surfaces yet. The trailer and the store cover still show the characters as they were
  before ADR 0025.

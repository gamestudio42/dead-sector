# Testing

| Requirement (AGENTS.md critical tests)                               | Test                                                  |
| -------------------------------------------------------------------- | ----------------------------------------------------- |
| simulation is deterministic for same seed and commands               | `packages/sim/test/determinism.test.ts`               |
| simulation core runs without DOM/Phaser                              | `packages/sim/test/architecture.test.ts`              |
| wall blocks path and line of sight                                   | `packages/sim/test/spatial.test.ts`                   |
| closed door attenuates sound more than open door                     | `packages/sim/test/noise.test.ts`                     |
| zombie out of sound radius does not investigate                      | `packages/sim/test/noise.test.ts`                     |
| zombie never chases live target position after losing all perception | `packages/sim/test/zombie.test.ts`                    |
| panic state enters/exits with hysteresis                             | `packages/sim/test/psychology.test.ts`                |
| no ammunition means no shot/no false gunshot noise                   | `packages/sim/test/combat.test.ts`                    |
| dead entity cannot attack or be killed repeatedly                    | `packages/sim/test/combat.test.ts`                    |
| pause never advances the simulation tick                             | `packages/sim/test/determinism.test.ts` (clock) + E2E |
| mission success requires rescuing and extracting civilian            | `packages/sim/test/mission.test.ts`                   |
| save/load preserves RNG and simulation continuation                  | `packages/sim/test/save.test.ts` + E2E                |

Also covered: window/door LOS, A* no-route, units never inside blocked tiles, sneak vs sprint attraction, movement
mode trade-offs, order replacement and `ORDER_BLOCKED`, leader succession, panic interrupting an order and rallying,
extraction timer, beacon gating, defeat-once, civilian death, time limit, both canonical-seed routes, content
validation errors, tick-time measurement.

E2E (`apps/web/e2e/flow.spec.ts`, Playwright Chromium against the production build): menu → start → select Alfa →
right-click move → pause (tick frozen, order queued) → resume → combat script plays the rest from tick 0 (shots,
infected reacting to sound, all 5 objectives, extraction) → debriefing → menu, with zero console errors; stealth run
with zero shots; save/load; HUD bounds at 1280×720 and 1920×1080. Screenshots are written to `screenshots/`.

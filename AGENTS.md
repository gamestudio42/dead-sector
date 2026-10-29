# AGENTS.md — Dead Sector

## Mission

Implement a **playable, original zombie-themed real-time tactics game** by following [`docs/SPECIFICATION.md`](docs/SPECIFICATION.md). This file is the operational instruction set for AI coding agents. The design document is the functional source of truth.

## Product invariants

1. The player commands **squads**; individual survivors act autonomously under threat.
2. Zombies use **local perception and memory**, never global player coordinates.
3. Noise sources propagate through the world with attenuation and obstacles.
4. Survivors use morale/stress, individual health, stamina, ammo and leadership.
5. The game is **pausable real-time tactics**, not tower defense or shooter.
6. The core simulation is **deterministic**, with 100 ms fixed ticks and an injected seeded RNG.
7. Simulation must not import Phaser, browser APIs, rendering code or UI components.
8. The first delivery must be a **complete playable mission**, not a screen mock-up.
9. No use of copyrighted assets, code, designs or maps extracted from existing games.
10. Code, commit messages, tests and technical docs in English; player-facing UI in PT-BR.

## Preferred stack

- `pnpm` monorepo
- TypeScript `strict`
- Vite + Phaser 3 for the web app
- Pure TypeScript simulation package
- Vitest + Playwright
- Data-driven content validated at startup
- Local storage/IndexedDB for settings and saves; no server dependency

## Work protocol

1. Read the full specification first, especially sections 5–9, 12, 15, 17, 18 and 25.
2. Inspect the repository and report what already exists. Reuse functioning code before rewriting.
3. Maintain `TASKS.md` with `NOW`, `NEXT`, `BLOCKED`, `DONE` sections.
4. Implement the smallest complete increment. Prefer full vertical integration over building disconnected frameworks.
5. Before marking a task done: typecheck, lint, run unit tests, build, and check the real UI.
6. Any placeholder must be explicitly named `TODO` or `placeholder`; never claim it implements a system.
7. Commit after stable milestones and include tests with each mechanical feature.
8. Record non-obvious trade-offs in `docs/decisions/`.
9. At the end of each milestone, update README: how to run, features working, known issues, screenshots/verification and next tasks.
10. Continue until all **MVP Phase 4** acceptance checks pass, unless a real blocking limitation prevents progress. In that case, document the blocker and deliver remaining functional work.

## Delivery sequence

### Milestone A — Foundation

- Render a 96×96 placeholder map; camera zoom/pan.
- Add 2 squads with 4 members each and basic selection.
- Fixed tick, deterministic RNG and pure simulation package.
- Tests for ticking, pause and seeded reproducibility.

**Gate:** browser displays map and selectable squads; tests pass.

### Milestone B — Commands and movement

- Implement tile passability, pathfinding, squad orders and survivor local positioning.
- Different movement modes (sneak, move, sprint) with noise/fatigue implications.
- Route visualization and `ORDER_BLOCKED` feedback.

**Gate:** units follow commands and never pass through walls.

### Milestone C — Perception and zombies

- LOS, fog of war and contact memory.
- Noise propagation with walls/doors.
- Walker and runner FSM with investigate/pursue/search/attack.
- Debug mode visualizing LOS, sound and current zombie state.

**Gate:** a zombie reacts only to seen/heard stimuli and loses targets appropriately.

### Milestone D — Combat and stress

- Fire discipline, guns, ammo, reload, hit/miss/damage, melee.
- Health/death, leader loss, stress/panic and rally behavior.
- Event log and HUD readings for all critical states.

**Gate:** shots consume ammo and produce noise; stress can interrupt risky orders; deaths are correctly handled once.

### Milestone E — Playable mission

- Build mission 'A Última Farmácia' on Bairro da Ferrugem.
- Pharmacy interaction, civilian rescue/follow behavior and timed extraction.
- Win/fail states, debriefing, save/load, menu, flow E2E.

**Gate:** the entire mission is completable end to end; there is a viable stealth path and a combat path; automation and build pass.

## Critical automated tests

- `simulation is deterministic for same seed and commands`
- `simulation core runs without DOM/Phaser`
- `wall blocks path and line of sight`
- `closed door attenuates sound more than open door`
- `zombie out of sound radius does not investigate`
- `zombie never chases live target position after losing all perception`
- `panic state enters/exits with hysteresis`
- `no ammunition means no shot/no false gunshot noise`
- `dead entity cannot attack or be killed repeatedly`
- `pause never advances the simulation tick`
- `mission success requires rescuing and extracting civilian`
- `save/load preserves RNG and simulation continuation`

## Definition of a good handoff

After each milestone, write a brief report: working behavior, files modified, commands executed, tests passed/failed, known limitations, screenshots, next milestone. Don't send only an enthusiastic claim that the game is ready; **show a playable build and evidence**.

## Start now

Implement **Milestone A** first and continue toward **Milestone E**. Prioritize playable software and measurable rules over menus, concept art or ambitious campaign features.

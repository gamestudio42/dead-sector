# TASKS

## NOW

- (none — vertical slice delivered; awaiting playtest feedback)

## NEXT

- Measure frame rate on real GPUs (low-end laptop, integrated graphics) with the in-game FPS readout; tune "Média"
  and "Baixa" accordingly.
- Snap release: confirm the first CI snap build, register `dead-sector` in the Snap Store and connect its Builds tab.
- Art upgrade: replace procedural character sheets with a hand-made or CC0 set (frame layout: 8 walk, attack, corpse).
- More objective types (defence, scavenging) for future missions; Phase 6 strategic campaign layer.

## BLOCKED

- Real-GPU FPS: `electron . --bench` was followed by an unexplained hard reset of the dev machine (hybrid Intel +
  NVIDIA); run it only with work saved, or on another machine, until that is understood.

## DONE

- Desktop shell: Electron app in `apps/desktop` with `--smoke` and `--bench`, strict snap, Snap CI workflow (ADR 0014).

- Controls from playtest feedback: WASD camera by default (arrows as secondary), Shift pans faster, Q retreat,
  E hide, Z/X/C modes, V hold; second key per action, WASD/Setas presets, camera speed, migration of saved keys,
  live key names in tips and tooltips (ADR 0013).

- Block 6 — finish: tick memoisation (identical results, ~2.3× faster), graphics quality + FPS readout, balance report
  on 10 seeds, installable offline app, loading screen, credits, build id.

- Block 5 — content: maps Pátio da Ferrovia and Centro Velho, missions Sinal Fraco and Plantão Noturno (night), mission
  texts in data, campaign Setor Ferrugem with roster carry-over, interlude, retries and local persistence, contextual
  tutorial; rescued civilians follow a calm escort.

- Block 4 — tactical depth: breakable windows, plank barricades (kits, hammer noise, removal), infection that turns
  survivors (medic slows it), heavy and screamer infected, escalating alarm (4 levels, hysteresis) and announced roaming
  hordes; save schema v3 + migration; stealth acceptance redefined as "no shot until the radio".

- Block 3 — controls: multi-squad selection (Shift, drag box), Shift-click waypoint queue in the simulation (save v2
  - migration), Ctrl + right-click order menu, rebindable physical keys with conflict swap.

- Block 2 — premium interface: title screen with live backdrop, briefing (map, objectives, intel, roster, seed),
  compact collapsible HUD with tooltips, minimap, options (audio buses, captions, high contrast, reduced motion,
  lighting, blood, HUD scale), graded debriefing with timeline and route map; F5/F9 quicksave/load.

- Block 1 — presentation and game feel: procedural terrain, animated character sprites, soft fog, dusk lighting,
  particles/decals/camera shake/damage vignette, order markers, procedural spatial audio + adaptive drone, survivor
  barks, menu settings (volume, mute, blood, lighting); tests for cue/bark determinism and state immutability.
- Git repository initialized (`main`); vertical slice (milestones A–E) committed as the first commit.
- Milestone A: monorepo, pure sim package, fixed tick, seeded RNG, map/camera, squads + selection, tick/pause/seed tests.
- Milestone B: passability, A*, formations, sneak/move/sprint (speed, stamina, noise), route preview, ORDER_BLOCKED.
- Milestone C: LOS, fog of war, contact memory, acoustic field with doors/walls, walker/runner FSM, debug overlay.
- Milestone D: fire discipline, weapons/ammo/reload/melee, hit/damage/death-once, stress + panic hysteresis, leadership, HUD + log.
- Milestone E: pharmacy mission, civilian follower, extraction, win/partial/fail, debriefing, menu, save/load, E2E.

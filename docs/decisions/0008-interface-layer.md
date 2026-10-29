# 0008 — Interface layer: HUD layout, minimap, options and debrief records

## Context

Block 2 of the quality roadmap asked for a premium-feeling interface without adding a UI framework, while keeping
the rule that the HUD never mutates the simulation and never reveals what the squads could not know.

## Decision

- The HUD stays plain DOM/CSS over the Phaser canvas (ADR 0006). Panels are collapsible and their state is a
  per-viewer preference in `localStorage` (`Settings`), never part of saves.
- The minimap draws from `GameState.contacts` for infected (visible = red, last-known = grey), so unseen zombies cannot
  leak; pings are only for events the squads know about (their own injuries, reinforcements announced in the log,
  the radio). It reuses `MapCanvas`, shared with the briefing and debrief maps.
- Sound captions are generated from the same audio cues as the WebAudio engine (`captionFor`), so captions and sound
  always agree and both stay downstream of sim events.
- The debriefing grade (`gradeFor`) is a pure function of `buildDebrief`, so it can never disagree with the numbers on
  screen and is unit-tested against both scripted routes. The timeline and route traces are recorded by the client
  while playing (`MissionRecord`); they are not part of `GameState`, which keeps save format and replay hashes
  unchanged — the cost is that a mission resumed from a save only shows what happened after loading.
- Menus use a decorative backdrop (real map, drifting infected, no simulation) so the first screen already shows the
  game's look.

## Consequences

- Key rebinding, drag selection and waypoints are deliberately left for block 3 (controls).
- E2E now goes menu → briefing → mission; tests cover options pausing the game, persisted layout, high contrast and
  minimap camera control.

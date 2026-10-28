# 0003 — Acoustic model tuning

**Status:** accepted (balance values live in `packages/content/rules/simulation.json`)

- Propagation: Dijkstra over the grid, max-intensity first. `remaining = previous − step·attenuation − absorption(tile)`.
  Diagonal steps are forbidden between two solid corners, so sound cannot squeeze through wall joints.
- `attenuationPerMeter = 1.6`. With 1.2 a pistol was heard ~46 m away and one firefight pulled the entire map; 1.6
  gives walkers (threshold 15) hearing radii of ≈34 m (pistol), 44 m (carbine), 47 m (shotgun) — still most of a
  quadrant, so shooting is a real strategic cost without making stealth pointless.
- Absorption: wall 30, closed door 18, window 10, open door 1, fence 1, bush 1.5. A closed door therefore cuts
  > 10 points compared with an open one (tested).
- Footsteps are one pulse per squad every 0.5 s: loudest member (sneak 5 / move 12 / sprint 24, ±stealth) plus 2 per
  extra moving member. Consequence: sneaking squads are inaudible to walkers, moving squads are heard within ~2 m,
  sprinting squads within ~9 m.
- Reinforcements: each spawner accumulates the intensity that reaches it; at 90 pressure (decaying 8 %/s) and with
  the entry out of sight and no survivor within 14 m, one infected enters already investigating the noise.
  Budget 30, cap 60 alive, 12 s cooldown per entry. Entries are drawn and labelled in debug mode.

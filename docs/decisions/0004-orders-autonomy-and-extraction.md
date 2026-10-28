# 0004 — Order execution, autonomy and extraction rules

**Status:** accepted

- Per-survivor priority stack each tick: panic (flee if courage ≥ 40 or breakdown, else freeze) > immediate threat in
  contact range (melee, or fire if weapons free) > reload > explicit order > idle. Panicked survivors drop
  interactions; once rallied they re-path to their formation slot.
- "Shaken" (stress ≥ 50) members refuse _move/sprint/attack_ legs whose destination has ≥ 3 known infected within 6 m;
  the HUD shows the reason. This is the concrete form of "stress can interrupt risky orders".
- Hold/hide give a small accuracy bonus; hide also lowers detection for still survivors and caps fire discipline at
  return fire.
- Survivors open unlocked closed doors automatically while pathing (door noise 10). Locked doors need an _interact_
  order (time drops with mechanics skill; noise 25). Infected route through closed doors at extra cost and bash them
  (HP 120 / 220 locked).
- Timed interactions (cabinet 5 s, rescue 3 s, radio 2 s) reset if the interactor is hit or an infected comes within
  1.6 m — the spec's "5 s protected" interaction.
- Extraction: the hold timer counts while ≥ 1 squad survivor is in the zone and **resets** if the zone empties. After
  20 s the mission succeeds as soon as the rescued civilian is also inside; otherwise the player may confirm leaving
  without her (partial success). The radio emits a loud signal on activation and every 5 s, so the hold is under pressure.

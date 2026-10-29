# 0013 — WASD camera by default, secondary keys and layout presets

## Context

Playtesters asked for the camera on WASD (the arrows forced a hand switch and clashed with their habits), for Q
retreat, E hide and the movement modes on Z/X/C, for Shift to pan faster, and for the keys to be visibly
configurable. The old layout used W/Q/E for movement modes, so WASD could not simply be added on top.

## Decision

- **New default layout "WASD"**: camera on W/A/S/D with the arrows as secondary keys; Z/X/C sneak/walk/sprint, V
  hold, E hide, Q retreat; everything else unchanged. The old layout stays as the **"Setas (clássico)"** preset.
- **Two keys per action** (primary + optional secondary). A key triggers at most one action. Rebinding a used key
  swaps it with the other action's previous key in the same slot; taking an action's only key is refused (or its
  secondary is promoted) so no action is ever left unbound. Esc stays reserved for menus.
- **Migration of saved bindings** (storage v1 → v2): keys the player had changed are kept; keys still on the old
  default move to the new layout, falling back to the old key when the player already uses the new one elsewhere.
- **Camera speed** is a setting (50–200 %); holding Shift multiplies it by 2.5.
- Tips, HUD tooltips and option hints name the **current** key at render time instead of hardcoding letters, and the
  first tip says every key can be changed in Opções → Controles.

## Consequences

Players with old saves keep their custom keys and get WASD camera for free. Tests cover the default layout, presets,
secondary keys, refusal/swap rules, migration and (E2E) WASD/Shift panning and orders on the new keys.

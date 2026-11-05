# 0016 — Combat effects baked offline with EffectCraft

## Context

ADR 0007 kept every visual generated at runtime. At the game's zoom the code-drawn muzzle flash and hit bursts read
as single dots, and making them richer in code would mean writing a small particle editor. The studio already uses
EffectCraft, a headless effects tool, for VFX in other games.

## Decision

- **Combat effects are baked**: muzzle flash, impact sparks, blood, ichor and dust are rendered by EffectCraft into
  PNG strips in `apps/web/public/fx`. Terrain, characters, lights and sound stay procedural.
- **Recipes are the source, not the PNGs**: `tools/vfx/recipes.mjs` lists the engine commands for each effect and
  `tools/vfx/bake.mjs` rebuilds them, so an effect is changed by editing its recipe and baking again.
- **A bake that looks fine is not trusted**: the script decodes every frame and refuses an effect that is nearly
  invisible, starts late or is still visible on its last frame. The manifest records the tool version, frame layout
  and hash of what shipped, and a unit test checks the strips against it.
- **Drawn at the size the game uses** (16 px cells): 32–64 px frames at 30 fps, about 46 KB in total.
- **Never required**: every effect falls back to the old particles when its sheet did not load or 48 are already
  playing, and the blood setting still swaps blood for dust. Effects read sim events only.

## Consequences

Rebaking needs `effectcraft-cli` and `ffmpeg` on the machine; playing and building the game does not. EffectCraft
ships daily and command ids drift, so a bake on a new version should be checked against the manifest's previous hashes
and previews before it replaces the strips.

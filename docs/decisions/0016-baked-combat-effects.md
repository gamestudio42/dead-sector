# 0016 — Combat effects baked offline with EffectCraft

## Context

ADR 0007 kept every visual generated at runtime. At the game's zoom the code-drawn muzzle flash and hit bursts read
as single dots, and making them richer in code would mean writing a small particle editor. The studio already uses
EffectCraft, a headless effects tool, for VFX in other games.

## Decision

- **Combat effects are baked**: muzzle flash, impact sparks, blood, ichor, dust, door and barricade splinters,
  glass shards, the screamer's shriek and infected deaths are rendered by EffectCraft into PNG strips in
  `apps/web/public/fx`. Terrain, characters, lights and sound stay procedural.
- **Recipes are the source, not the PNGs**: `tools/vfx/recipes.mjs` lists the engine commands for each effect and
  `tools/vfx/bake.mjs` rebuilds them, so an effect is changed by editing its recipe and baking again.
- **A bake that looks fine is not trusted**: the script decodes every frame and refuses an effect that is nearly
  invisible, starts late or is still visible on its last frame. The manifest records the tool version, frame layout
  and hash of what shipped, and a unit test checks the strips against it.
- **Ambient loops** (wreck fire, wreck smoke, the radio beacon's pulse) are built only from properties that are
  periodic in time, including the flames' noise evolution. The bake renders one frame past the period and refuses a
  loop unless that frame matches the first; all three measure 0/255. Wrecks keep the particle plume as the fallback,
  and the beacon pulses on every graphics quality because it marks the objective. A wreck's fire, smoke, glow and light only show once its
  cell has been explored, like the map under it: the glow and the light already leaked through the fog before this.
- **Interface animations** (horde warning, the night passing, convoys, a fallen sector) use the same strips in the
  HTML interface, stepped by CSS (`ui/fxIcon.ts`), drawn at twice their on-screen size. They play once per night and
  show a still frame with reduced motion. A fallen sector's mark is a `hold` recipe: it ends on a frame meant to stay. The HUD adds an objective
  check, a rescue, a bite and a panic burst on the unit card; the cards are rebuilt many times a second, so a loop
  there gets its phase from the clock when the markup is written (`resolveSync`) instead of restarting.
- **Drawn at the size the game uses** (16 px cells): 32–96 px frames at 15–30 fps. Sheets wrap onto more rows so
  none is wider than 4096 px, a limit many GPUs have.
- **Information stays drawn by the game**: the screamer's hearing radius is still a ring sized from the rules; the
  baked shriek only marks its source.
- **Never required**: every effect falls back to the old particles when its sheet did not load or 48 are already
  playing, and the blood setting still swaps blood for dust. Effects read sim events only.

## Consequences

Rebaking needs `effectcraft-cli` and `ffmpeg` on the machine; playing and building the game does not. EffectCraft
ships daily and command ids drift, so a bake on a new version should be checked against the manifest's previous hashes
and previews before it replaces the strips.

# ADR 0018 — Character sheets rendered in Blender

**Status:** accepted — 2026-11-13

## Context

ADR 0007 drew every character in code at boot: flat ellipses and strokes on 32 px frames. They read at the game's
zoom, but they look like placeholders next to the painted terrain and the baked effects (ADR 0016), and that hurts
first impressions in screenshots, the trailer and the store page. The studio has no character artist. Blender runs
headless on the dev machine.

## Decision

- **Characters are 3D models rendered top-down offline.** `tools/sprites/bake_characters.py` runs in
  `blender -b --factory-startup` and builds each survivor template and infected look from primitives on a joint
  hierarchy (pelvis, spine, neck, head, two-bone arms and legs). It poses ten frames and renders them with Cycles on
  the CPU through an orthographic camera looking straight down.
- **Same layout as before.** Frames 0–7 are the walk cycle (frame 0 is also the idle pose), 8 is the attack and 9 is
  the corpse. The character faces +x. A frame is 128 px and spans two map cells (64 px per cell). That leaves room for
  long guns, reaching infected and a full-length corpse, laid on the diagonal so it fits. Survivors keep their
  shoulder width of about half a cell.
- **The light comes from straight above.** The game rotates each sprite by the actor's facing, so a light from one
  side would turn with the actor. A soft overhead sun plus ambient light gives shape without a fixed direction.
  Ground shadows stay with the renderer.
- **Readability comes first.** Squad colours are on the shoulder tabs and armbands, which show from above. The medic
  carries a white bag with a red cross, and long-gun carriers wear a back pouch. Infected lean forward with their
  arms out, and the screamer tips its head back so its open mouth shows. Every frame gets a 2 px dark outline, the
  colour of the old sprites' strokes.
- **One source of truth for looks.** Colours and gear are in `apps/web/src/render/characterLooks.json`. The bake reads
  that file and each survivor's weapon from `packages/content`. The code-drawn sheets read the same file and stay as
  the fallback for any sheet that fails to load.
- **The bake checks its own output.** For every frame it measures coverage and the alpha in the outermost 3 px. It
  fails if a frame is nearly empty or a limb touches the edge. `public/sprites/manifest.json` records the Blender
  version, the frame layout and a hash of each sheet, and `apps/web/test/sprites.test.ts` checks the shipped files
  against it.

## Consequences

- The 16 sheets add about 780 KB to the site, and a full bake takes about 50 s on the CPU.
- To change a character, edit the look or the script and bake again. Nobody hand-paints the PNGs.
- The models have no textures, faces or sculpted hands. More fidelity means better models in the same script, not a
  new pipeline.
- Display scale depends on the sheet: `spriteScale(key)` uses 64 px per cell for a baked sheet and 32 px per cell for
  a code-drawn one.

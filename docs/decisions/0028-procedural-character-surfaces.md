# ADR 0028 — Procedural character surfaces

**Status:** accepted — 2026-11-17

## Context

After ADR 0025 the character models had faces, hands and cloth folds, but every surface was one flat colour. ADR 0025
named textures as the next step. The bake renders 128 px frames over 1.9 m, so a pixel is about 1.5 cm. A cloth
weave or pores would not show at that size; patches a few centimetres across would.

## Decision

- **Procedural shaders, no image textures.** `material()` in `tools/sprites/bake_characters.py` takes an optional
  `surface`. That surface drives the base colour through a noise texture in object space. The noise is offset by
  each part's random value, so neighbouring parts do not share a pattern. There are no UVs or image files to keep in
  step with the models.
- **Five surfaces.** Each one sets a noise scale, a darkest and a lightest shade of the part's own colour, and an
  optional second layer:

  | Surface | Used on                                 | Look                                           |
  | ------- | --------------------------------------- | ---------------------------------------------- |
  | `cloth` | survivors' clothes, caps, helmets, bags | worn, uneven patches                           |
  | `grimy` | the infected's clothes                  | the same, plus dark grime and dried blood      |
  | `skin`  | survivors' skin                         | a slight unevenness of tone                    |
  | `rot`   | the infected's skin                     | a stronger mottling, plus purple-grey bruising |
  | `hair`  | hair                                    | fine light and dark strands                    |

  The grime and bruising use a second noise in a different 4D slice, so they do not follow the shading of the
  first.

- **No sculpted pass.** Rounder torsos and heads would show mostly on corpses and close up, at a much higher cost in
  modelling and bake time, so they wait.

## Consequences

- `docs/testing/screenshots/surfaces-before-after.png` sets the old frames (top row) above the new ones.
- 23 sheets, about 1.69 MB, up from about 1.66 MB. A full bake took 59 s on the CPU this time.
- The code-drawn fallback stays flat-coloured.
- Seams and folds still come from geometry. The surfaces only vary the colour.

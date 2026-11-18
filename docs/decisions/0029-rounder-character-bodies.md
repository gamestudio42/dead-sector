# ADR 0029 — Rounder character bodies

**Status:** accepted — 2026-11-18

## Context

After ADR 0025 and ADR 0028 the characters had faces, hands, cloth folds and textured surfaces. The torso, hips, vest
and medic's bag, however, were still bevelled boxes. From above, a standing character mostly shows the tops of its
shoulders and head, so the boxes showed mainly on corpses: a body lying down looked like a slab with square
shoulders. The head was already built from ellipsoids.

## Decision

- **Soft body blocks.** A new `body()` in `tools/sprites/bake_characters.py` makes a bevelled box and smooths it
  with a level-2 subdivision surface. The torso, hips, vest and medic's bag use it. Small parts stay sharp boxes: the
  belt, folds, straps, tie and gun.
- **A waist.** The torso narrows to 84 % at the bottom, so it is broader at the shoulders than at the waist. A hospital
  gown hangs straight instead: tapered, it let the hips show through at the back.
- **Back details follow the body.** The gown's open back used to be one long strip. Now it is short pieces, and
  each sits on the narrowing back at its own height, so none floats off a corpse lying face down.
- **No sculpted pass.** No muscles, creases or sculpted faces: at 1.5 cm a pixel they would barely show.

## Consequences

- Corpses read as bodies instead of slabs, and standing characters show slightly rounder shoulders.
- 23 sheets, about 1.68 MB, down slightly from 1.69 MB: the smoother shading compresses a little better.
- The full bake took about 2.5 min. Other work was loading the machine at the time (load average about 20), so this
  is not a measure of the cost of the subdivision.
- `docs/testing/screenshots/bodies-before-after.png` sets the old frames (top row) above the new ones.
- The code-drawn fallback is unchanged.

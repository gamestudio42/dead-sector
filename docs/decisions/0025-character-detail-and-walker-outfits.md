# ADR 0025 — Character detail and walker outfits

**Status:** accepted — 2026-11-15

## Context

ADR 0018 moved the characters to Blender renders. The models were built from plain primitives: the head was an
egg, each hand was a ball, the torso was a bevelled box, and only four walker looks existed. In crowds the same
four walkers repeated, and the corpses had no faces. ADR 0018 already said where more fidelity should come from:
better models in the same script, not a new pipeline.

## Decision

- **Heads.** A head now has a skull, a jaw, a nose and ears. Survivors get eyes, brows and a mouth. The infected get
  dark sockets, yellow eyes and a grimace. The face shows on corpses, which lie face up, and on the screamer.
- **Hair styles.** Hair is a cap broken up by clumps, so it reads as hair from above. The `hairStyle` look field picks
  `short`, `buzz`, `long`, `ponytail` or `bald`. The infected default to `patchy`, a thinner cap with a torn bloody
  patch on the scalp. A cap or helmet hides the hair except at the nape.
- **Hands.** A hand has a palm, four fingers and a thumb. The infected have longer fingers, hooked forward. Soldiers
  with `gloves` wear dark gloves.
- **Clothes.** Every torso has:
  - a yoke seam, a collar, and diagonal folds across the shoulder blades in a lighter and a darker shade;
  - a belt with a buckle;
  - cuffs and hems where the sleeves end, plus a crease above each boot.
    Long-gun carriers and the medic wear straps over both shoulders. The infected also get holes in the shirt that show
    skin, and a bite on one shoulder.
- **Outfits.** The `outfit` look field decides what covers the arms and legs and what is worn over the torso:

  | Outfit   | What shows                                             |
  | -------- | ------------------------------------------------------ |
  | `jacket` | survivors' default: long sleeves with cuffs            |
  | `tee`    | short sleeves with a hem, bare forearms                |
  | `tank`   | bare arms                                              |
  | `hoodie` | long sleeves and a hood lying on the back              |
  | `office` | a white collar and a tie                               |
  | `vest`   | a high-visibility vest with reflective stripes         |
  | `gown`   | a long hospital gown, open at the back, over bare legs |

- **Walkers.** There are now eight walker looks instead of four. The four new ones are an office worker, a road
  worker in a vest, a patient in a gown, and a bald man in a hoodie. The runner wears a tee, the heavy a tank top and
  the screamer a hospital gown. `zombieTextureKey` already spreads walkers over however many looks exist, so the
  game picks up the new sheets without code changes.
- **A faster bake.** The extra parts made the bake three times slower when every part called a Blender operator.
  Now each primitive is made once, kept as a template mesh, and copied per part.

## Consequences

- 20 sheets instead of 16: about 1.05 MB in all, up from about 780 KB. A full bake takes about 75 s on the CPU.
- `docs/testing/screenshots/characters-before-after.png` sets the old frames next to the new ones.
- The code-drawn fallback reads the same looks file. It draws the new walkers in their colours but without the outfit
  details: it is only a fallback.
- Still no textures, sculpted surfaces or painted faces. The next steps would be more infected types or animation
  variety: a crawler, and a stagger when hit.

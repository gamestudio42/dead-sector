# 0007 — Procedural presentation layer (art, light, audio, barks)

## Context

The vertical slice played correctly but read as a prototype: flat tiles, circles for units, hard-edged fog, no audio.
The project must not ship third-party game assets, has no artist yet, and the simulation must stay deterministic and
free of browser APIs.

## Decision

- All new visuals and sounds are **generated at runtime** in the web client: terrain painted once to a 2× canvas,
  character sheets drawn to canvases at boot (`SpriteFactory`), sounds synthesized with WebAudio (`AudioEngine`).
  Nothing is downloaded or bundled, so provenance is trivially original (see `ASSETS.md`).
- Presentation is a **pure consumer of simulation events**. `cuesForEvents` and `barksForEvents` map `SimEvent`s to
  audio cues and speech lines; they never write to `GameState`. Tests replay the scripted combat route and assert the
  state hash is unchanged after every tick and that each gunshot sound maps to exactly one `SHOT_FIRED` event. This
  keeps spec §14's rule: an effect can never be heard by zombies unless the sim already emitted the noise.
- Lighting is mood only (dusk darkness with lights erased from a ¼-resolution render texture). The fog of war remains
  the sole authority on what the player knows; smouldering wrecks have no sound and no gameplay effect.
- Randomness in presentation (particle spread, miss scatter, sound variation) uses `Math.random` in the web app only;
  bark text choice is hashed from the event id so replays read the same.

## Consequences

- Fidelity is bounded by what code-drawn art can do; character sheets keep a fixed frame layout (8 walk, attack,
  corpse) so a hand-made or CC0 set can replace them without touching the renderer.
- Audio requires a user gesture to start (browser policy); the engine unlocks on the first click/key.
- Settings (volume, mute, blood, lighting) live in `localStorage` behind try/catch; private mode just keeps defaults.

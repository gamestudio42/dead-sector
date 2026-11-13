# ADR 0019 — Adaptive score synthesized at runtime

**Status:** accepted — 2026-11-13

## Context

Until now the only "music" was the tension drone: three detuned saws that rise with the threat. The menu, the
campaign map and the debriefing were silent, and nothing told the player in sound that a fight had started. The
trailer is silent too. All game audio is synthesized at runtime (ADR 0007), and the project ships no third-party
audio.

## Decision

- **The score is data, synthesized with WebAudio.**
  - `apps/web/src/audio/music.ts` is pure. It returns the notes that start on a step and how loud each layer should
    be.
  - `apps/web/src/audio/MusicPlayer.ts` plays those notes with small synths: a detuned saw pad, a sine and triangle
    bass, a plucked pulse and lead, a kick, and noise snare and hats.
  - Notes are scheduled 0.35 s ahead on the audio clock, so timing does not depend on frame rate. A tab that was
    throttled in the background skips ahead instead of firing a burst.
- **Three pieces in A minor.**
  - **Menu, briefing and debriefing (70 BPM):** Am–F–Dm–E. The theme melody plays on every other pass through the
    eight bars, so it does not wear out.
  - **Campaign map (66 BPM):** a slow arpeggio over Am–F–C–G.
  - **Tactical (92 BPM):** the loop leans on B♭, the flat second, for dread, and the E major chord resolves the
    phrases.
- **The tactical score follows the fight.** It reads the same threat value as the drone, plus the district alarm and
  the extraction:
  - only the pad while the squad sneaks;
  - a heartbeat bass once something hunts the squad;
  - an eighth-note pulse as the threat closes in, during the extraction, or from alarm level 2;
  - drums when the threat is high or the alarm is at level 2 or 3, with sixteenth-note hats at level 3.

  Layers fade over seconds, never on a beat. More threat never makes a layer quieter, and a unit test checks this.

- **The music gives way to the stings.** It stops when a mission ends, so the victory or defeat sting plays alone.
  The debriefing brings the theme back 2.5 s later.
- **Players control it.** A new "Música" volume slider sits in Opções → Áudio, default 60 %, and the music has its
  own bus under the master volume and mute.
- **The score can be rendered to files.** `tools/music/render.mjs` plays the same `MusicPlayer` in an
  `OfflineAudioContext` in headless Chromium and writes WAV clips: each piece, each tactical intensity and a 30 s
  arc for the trailer. It fails if a clip clips or is nearly silent. The first render peaks at −6.8 dBFS.

## Consequences

- No audio files ship and there is no licence to track. Musical changes are edits to `music.ts`, covered by unit
  tests: the score is deterministic, stays in key, stays within range and the layers grow with the threat.
- Synths cost CPU. A tactical bar at alarm level 3 starts about 40 short voices, which is small next to combat
  effects.
- The timbres are simple. Recorded or sample-based instruments would need a new decision, about file size and
  licences.
- Nobody has listened to it yet, so the mix balance is set by measurement only.

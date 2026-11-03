import { catalog, fill } from '../ui/i18n';
import type { Cue, CueKind } from './cues';

/**
 * Caption text for a cue heard from `listener` (camera centre, cells), e.g. "[Shots — near, to the
 * east]" or "[Groans — muffled, far, to the north]". Interface cues and footsteps return null.
 */
export function captionFor(cue: Cue, listener: { x: number; y: number }): string | null {
  const copy = catalog().captions;
  const labels: Partial<Record<CueKind, string>> = {
    gunshot: copy.gunshot,
    groan: copy.groan,
    shriek: copy.shriek,
    horde: copy.horde,
    doorBreak: copy.doorBreak,
    door: copy.door,
    hurt: copy.hurt,
    bite: copy.bite,
    death: copy.death,
    zombieDeath: copy.zombieDeath,
    radio: copy.radio,
    dryFire: copy.dryFire,
    glass: copy.glass,
    hammer: copy.hammer,
    bash: copy.bash,
    scream: copy.scream,
    hordeWarning: copy.hordeWarning,
    turn: copy.turn,
  };
  const label = labels[cue.kind];
  if (!label) return null;
  if (cue.x === undefined || cue.y === undefined) return `[${label}]`;
  const dx = cue.x - listener.x;
  const dy = cue.y - listener.y;
  const d = Math.hypot(dx, dy);
  const dist = d < 8 ? copy.near : d < 25 ? copy.mid : copy.far;
  const where =
    d < 3
      ? copy.here
      : fill(copy.toward, {
          dir: copy.dirs[(Math.round((Math.atan2(dy, dx) * 180) / Math.PI / 45) + 8) % 8] ?? '',
        });
  return `[${label} — ${cue.muffled ? `${copy.muffled}, ` : ''}${dist}, ${where}]`;
}

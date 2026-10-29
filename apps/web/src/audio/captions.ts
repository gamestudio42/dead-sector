import type { Cue, CueKind } from './cues';

/** PT-BR caption labels for sounds worth subtitling (spec 13.3); others stay silent on screen. */
const LABELS: Partial<Record<CueKind, string>> = {
  gunshot: 'Tiros',
  groan: 'Rosnados',
  shriek: 'Guincho de corredor',
  horde: 'Horda se movendo',
  doorBreak: 'Porta arrombada',
  door: 'Porta rangendo',
  hurt: 'Grito de dor',
  bite: 'Mordida!',
  death: 'Alguém caiu',
  zombieDeath: 'Infectado abatido',
  radio: 'Rádio chiando',
  dryFire: 'Clique de arma vazia',
};

const DIRS = ['leste', 'sudeste', 'sul', 'sudoeste', 'oeste', 'noroeste', 'norte', 'nordeste'];

/**
 * Caption text for a cue heard from `listener` (camera centre, cells), e.g. "[Tiros — perto, a
 * leste]" or "[Rosnados — abafado, a norte]". Interface cues and footsteps return null.
 */
export function captionFor(cue: Cue, listener: { x: number; y: number }): string | null {
  const label = LABELS[cue.kind];
  if (!label) return null;
  if (cue.x === undefined || cue.y === undefined) return `[${label}]`;
  const dx = cue.x - listener.x;
  const dy = cue.y - listener.y;
  const d = Math.hypot(dx, dy);
  const dist = d < 8 ? 'perto' : d < 25 ? 'médio' : 'longe';
  const where =
    d < 3 ? 'aqui' : `a ${DIRS[(Math.round((Math.atan2(dy, dx) * 180) / Math.PI / 45) + 8) % 8]}`;
  return `[${label} — ${cue.muffled ? 'abafado, ' : ''}${dist}, ${where}]`;
}

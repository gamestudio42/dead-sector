import type { Debrief } from '@dead-sector/sim';
import { text } from '../ui/i18n';

export interface Grade {
  letter: 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
  /** Short reasons, most important first, in the language the player is reading. */
  notes: string[];
}

const LETTERS: Grade['letter'][] = ['S', 'A', 'B', 'C', 'D'];

/**
 * Operation rating for the debriefing. Outcome sets the ceiling; losses, bites and noise lower it.
 * Pure function of the debrief so it can be tested and never disagrees with the numbers shown.
 */
export function gradeFor(d: Debrief, noiseBudget = 20000): Grade {
  if (d.outcome === 'failed') return { letter: 'F', notes: [text('grade.failed')] };
  const notes: string[] = [];
  let tier = d.outcome === 'partial' ? 3 : 0;
  if (d.outcome === 'partial') notes.push(text('grade.civilianLeft'));
  const lost = d.survivors.filter((s) => s.status === 'dead' && s.squadId !== null).length;
  const left = d.survivors.filter((s) => s.status === 'alive' && s.squadId !== null).length;
  if (lost) notes.push(text(lost === 1 ? 'grade.casualtyOne' : 'grade.casualtyMany', { n: lost }));
  if (left) notes.push(text(left === 1 ? 'grade.leftOne' : 'grade.leftMany', { n: left }));
  tier += lost + left;
  const bitten = d.survivors.filter((s) => s.bitten && s.status !== 'dead').length;
  if (bitten) {
    tier += 1;
    notes.push(text(bitten === 1 ? 'grade.bittenOne' : 'grade.bittenMany', { n: bitten }));
  }
  if (d.totalNoise > noiseBudget) {
    tier += 1;
    notes.push(text('grade.loud'));
  } else notes.push(text('grade.quiet'));
  if (!d.medicineRecovered) {
    tier += 1;
    notes.push(text('grade.noMedicine'));
  }
  return { letter: LETTERS[Math.min(tier, LETTERS.length - 1)] as Grade['letter'], notes };
}

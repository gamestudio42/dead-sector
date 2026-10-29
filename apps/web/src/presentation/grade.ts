import type { Debrief } from '@dead-sector/sim';

export interface Grade {
  letter: 'S' | 'A' | 'B' | 'C' | 'D' | 'F';
  /** Short PT-BR reasons, most important first. */
  notes: string[];
}

const LETTERS: Grade['letter'][] = ['S', 'A', 'B', 'C', 'D'];

/**
 * Operation rating for the debriefing. Outcome sets the ceiling; losses, bites and noise lower it.
 * Pure function of the debrief so it can be tested and never disagrees with the numbers shown.
 */
export function gradeFor(d: Debrief, noiseBudget = 20000): Grade {
  if (d.outcome === 'failed') return { letter: 'F', notes: ['Operação fracassada'] };
  const notes: string[] = [];
  let tier = d.outcome === 'partial' ? 3 : 0;
  if (d.outcome === 'partial') notes.push('Civil deixada para trás');
  const lost = d.survivors.filter((s) => s.status === 'dead' && s.squadId !== null).length;
  const left = d.survivors.filter((s) => s.status === 'alive' && s.squadId !== null).length;
  if (lost) notes.push(`${lost} ${lost === 1 ? 'baixa' : 'baixas'} na equipe`);
  if (left)
    notes.push(
      `${left} ${left === 1 ? 'sobrevivente deixado' : 'sobreviventes deixados'} para trás`,
    );
  tier += lost + left;
  const bitten = d.survivors.filter((s) => s.bitten && s.status !== 'dead').length;
  if (bitten) {
    tier += 1;
    notes.push(`${bitten} ${bitten === 1 ? 'mordido' : 'mordidos'} — risco de infecção`);
  }
  if (d.totalNoise > noiseBudget) {
    tier += 1;
    notes.push('Barulho alto atraiu reforços');
  } else notes.push('Disciplina de ruído');
  if (!d.medicineRecovered) {
    tier += 1;
    notes.push('Medicamentos não recuperados');
  }
  return { letter: LETTERS[Math.min(tier, LETTERS.length - 1)] as Grade['letter'], notes };
}

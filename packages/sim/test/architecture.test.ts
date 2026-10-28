import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GameSimulation } from '../src';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : p.endsWith('.ts') ? [p] : [];
  });
}

describe('architecture', () => {
  it('simulation core runs without DOM/Phaser', () => {
    expect(typeof (globalThis as Record<string, unknown>)['window']).toBe('undefined');
    expect(typeof (globalThis as Record<string, unknown>)['document']).toBe('undefined');
    const sim = GameSimulation.create();
    sim.run(50);
    expect(sim.tick).toBe(50);
    const src = join(__dirname, '../src');
    for (const f of files(src)) {
      const text = readFileSync(f, 'utf8');
      expect(text, f).not.toMatch(/from ['"]phaser/);
      expect(text, f).not.toMatch(/Math\.random\(/);
      expect(text, f).not.toMatch(/\b(window|document|localStorage|requestAnimationFrame)\./);
    }
  });
});

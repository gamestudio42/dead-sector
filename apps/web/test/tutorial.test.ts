import { describe, expect, it } from 'vitest';
import { loadContent } from '@dead-sector/content';
import { createPlanRunner, GameSimulation, MISSION_PLANS, tickPlan } from '@dead-sector/sim';
import { startTips, tip, tipsForEvents } from '../src/presentation/tutorial';
import { MT, setMissionTexts, T } from '../src/ui/i18n';

describe('contextual tutorial', () => {
  it('opens with the command tip, once', () => {
    expect(startTips(new Set())).toEqual(['select']);
    expect(startTips(new Set(['select']))).toEqual([]);
  });

  it('each situation triggers its tip the first time only, across a whole mission', () => {
    const sim = GameSimulation.create('a-ultima-farmacia', undefined, loadContent());
    const runner = createPlanRunner();
    const seen = new Set<string>(['select']);
    const order: string[] = [];
    while (!sim.ended && sim.tick < 9000) {
      tickPlan(sim, MISSION_PLANS['a-ultima-farmacia']!, runner);
      for (const id of tipsForEvents(sim.step(), sim.state, seen)) {
        expect(seen.has(id)).toBe(false);
        seen.add(id);
        order.push(id);
      }
    }
    // the combat route meets most situations, in a sensible order
    for (const id of ['sneak', 'contact', 'noise', 'rescue', 'extraction'])
      expect(order).toContain(id);
    expect(order.indexOf('contact')).toBeLessThan(order.indexOf('extraction'));
    for (const id of order) expect(tip(id)?.text.length).toBeGreaterThan(20);
  });
});

describe('mission texts', () => {
  it('each mission renames its item, person and objectives everywhere', () => {
    const c = loadContent();
    for (const id of ['sinal-fraco', 'plantao-noturno', 'a-ultima-farmacia']) {
      const m = c.missions[id]!;
      setMissionTexts(m.texts);
      expect(T.objectives['collectMedicine']).toBe(m.texts.objectives.collectMedicine);
      expect(T.endReason['civilianDied']).toContain(m.texts.person.slice(2));
      expect(MT.itemTag).toBe(m.texts.itemTag);
      expect(tip('rescue')?.text.toLowerCase()).toContain(m.texts.person.slice(2));
    }
  });
});

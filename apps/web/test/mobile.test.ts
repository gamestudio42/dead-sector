import { describe, expect, it } from 'vitest';
import { adaptPointerCopy, setLocale } from '../src/ui/i18n';
import { sectorAnchor } from '../src/ui/sectorLayout';
import {
  clearTouchMap,
  createTouchMap,
  LONG_PRESS_MS,
  TAP_SLOP_PX,
  touchDown,
  touchHold,
  touchMove,
  touchUp,
} from '../src/input/TouchMap';

const PHARMACY_INTEL =
  'Infectados atraídos quebram janelas e portas. Cada esquadrão tem 2 kits de tábuas para barricar (Ctrl + clique direito ou B) — martelar faz barulho.';

describe('touch copy', () => {
  it('leaves the mouse instruction unchanged for a fine pointer', () => {
    setLocale('pt-BR');
    expect(adaptPointerCopy(PHARMACY_INTEL, false)).toBe(PHARMACY_INTEL);
    setLocale('en');
    expect(adaptPointerCopy('Ctrl + right click or B', false)).toBe('Ctrl + right click or B');
  });

  it('names the long-press on a coarse pointer, in each language', () => {
    setLocale('pt-BR');
    expect(adaptPointerCopy(PHARMACY_INTEL, true)).toContain('toque longo');
    expect(adaptPointerCopy(PHARMACY_INTEL, true)).not.toContain('Ctrl + clique direito ou B');
    setLocale('en');
    expect(adaptPointerCopy('barricade (Ctrl + right click or B) — loud', true)).toBe(
      'barricade (long-press, then Barricade) — loud',
    );
    setLocale('de');
    expect(adaptPointerCopy('Verbarrikadieren (Strg + Rechtsklick oder B) — laut', true)).toContain(
      'langes Drücken',
    );
  });

  it('replaces the longer phrase before a prefix of it', () => {
    setLocale('en');
    expect(adaptPointerCopy('click or drag a box', true)).toBe('tap the squad');
    expect(adaptPointerCopy('Select a squad (1, 2, click or drag)', true)).toBe(
      'Select a squad (1, 2, tap the squad)',
    );
  });
});

describe('campaign map anchors', () => {
  it('keeps edge labels inside the map and centers the rest', () => {
    expect(sectorAnchor(14)).toBe('left');
    expect(sectorAnchor(90)).toBe('right');
    expect(sectorAnchor(38)).toBe('center');
    expect(sectorAnchor(70)).toBe('center');
  });
});

describe('touch map gestures', () => {
  it('a short press is a tap and a drag is a pan', () => {
    const map = createTouchMap();
    touchDown(map, 1, 10, 10, 0);
    expect(touchUp(map, 1, 12, 11, 100)).toEqual({ type: 'tap', x: 12, y: 11 });

    touchDown(map, 1, 0, 0, 0);
    const pan = touchMove(map, 1, TAP_SLOP_PX + 5, 0);
    expect(pan?.type).toBe('pan');
    expect(touchUp(map, 1, 40, 0, 200)).toBeNull();
  });

  it('a still finger opens the order menu once and does not also tap', () => {
    const map = createTouchMap();
    touchDown(map, 1, 30, 40, 0);
    expect(touchHold(map, LONG_PRESS_MS - 1)).toBeNull();
    expect(touchHold(map, LONG_PRESS_MS)).toEqual({ type: 'long', x: 30, y: 40 });
    expect(touchHold(map, LONG_PRESS_MS + 50)).toBeNull();
    expect(touchUp(map, 1, 30, 40, LONG_PRESS_MS + 80)).toBeNull();
  });

  it('a second finger cancels the long-press and pinches', () => {
    const map = createTouchMap();
    touchDown(map, 1, 0, 0, 0);
    touchDown(map, 2, 100, 0, 10);
    expect(touchHold(map, LONG_PRESS_MS + 10)).toBeNull();
    const zoom = touchMove(map, 2, 140, 0);
    expect(zoom?.type).toBe('zoom');
    if (zoom?.type === 'zoom') expect(zoom.factor).toBeGreaterThan(1);
    clearTouchMap(map);
    expect(touchHold(map, 9999)).toBeNull();
  });
});

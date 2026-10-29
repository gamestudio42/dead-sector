import { beforeEach, describe, expect, it } from 'vitest';
import { loadContent } from '@dead-sector/content';
import { GameSimulation } from '@dead-sector/sim';
import { DEFAULT_BINDINGS, KeyBindings, keyLabel } from '../src/input/KeyBindings';
import { commandsForRightClick, spreadTargets, targetAt } from '../src/input/OrderController';
import { squadsInRect } from '../src/input/SelectionController';

const sim = () => GameSimulation.create('a-ultima-farmacia', 1337, loadContent());

describe('key bindings', () => {
  beforeEach(() => KeyBindings.reset());

  it('defaults map physical keys to actions', () => {
    expect(KeyBindings.actionFor('KeyQ')).toBe('modeSneak');
    expect(KeyBindings.actionFor('Space')).toBe('pause');
    expect(KeyBindings.actionFor('KeyZ')).toBeNull();
  });

  it('rebinding to a used key swaps the two actions, so nothing is left unbound', () => {
    const swapped = KeyBindings.set('hold', 'KeyQ');
    expect(swapped).toBe('modeSneak');
    expect(KeyBindings.get('hold')).toBe('KeyQ');
    expect(KeyBindings.get('modeSneak')).toBe(DEFAULT_BINDINGS.hold);
    const codes = Object.values(KeyBindings.all());
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('Escape is reserved for menus', () => {
    expect(KeyBindings.set('pause', 'Escape')).toBeNull();
    expect(KeyBindings.get('pause')).toBe('Space');
  });

  it('labels keys for PT-BR players', () => {
    expect(keyLabel('KeyH')).toBe('H');
    expect(keyLabel('Digit2')).toBe('2');
    expect(keyLabel('Space')).toBe('Espaço');
    expect(keyLabel('ArrowLeft')).toBe('←');
  });
});

describe('orders from the pointer', () => {
  it('Shift-click marks every command as queued', () => {
    const s = sim();
    const cmds = commandsForRightClick(
      s.world,
      s.state,
      ['alfa', 'bravo'],
      { x: 30.5, y: 6.5 },
      { queue: true },
    );
    expect(cmds).toHaveLength(2);
    for (const c of cmds) expect(c.type === 'issueOrder' && c.payload.queue).toBe(true);
  });

  it('several squads moving to one point line up without stacking', () => {
    const s = sim();
    const p = { x: 30.5, y: 20.5 };
    const spots = spreadTargets(s.state, ['alfa', 'bravo'], p);
    const a = spots.get('alfa')!;
    const b = spots.get('bravo')!;
    expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(2);
    // centred on the clicked point
    expect((a.x + b.x) / 2).toBeCloseTo(p.x, 5);
    expect((a.y + b.y) / 2).toBeCloseTo(p.y, 5);
  });

  it('a single squad goes exactly where clicked', () => {
    const s = sim();
    const [cmd] = commandsForRightClick(s.world, s.state, ['alfa'], { x: 12.5, y: 9.5 });
    expect(cmd?.type === 'issueOrder' && cmd.payload.targetPosition).toEqual({ x: 12.5, y: 9.5 });
  });

  it('interacting sends only the first selected squad', () => {
    const s = sim();
    const door = s.state.doors.find((d) => !d.locked)!;
    const p = { x: door.cell.x + 0.5, y: door.cell.y + 0.5 };
    expect(targetAt(s.world, s.state, p)?.kind).toBe('interact');
    const cmds = commandsForRightClick(s.world, s.state, ['alfa', 'bravo'], p);
    expect(cmds).toHaveLength(1);
    expect(cmds[0]?.type === 'issueOrder' && cmds[0].payload.type).toBe('interact');
  });

  it('forcing a move type ignores interactables under the cursor', () => {
    const s = sim();
    const door = s.state.doors.find((d) => !d.locked)!;
    const p = { x: door.cell.x + 0.5, y: door.cell.y + 0.5 };
    const [cmd] = commandsForRightClick(s.world, s.state, ['alfa'], p, { moveType: 'sneak' });
    expect(cmd?.type === 'issueOrder' && cmd.payload.type).toBe('sneak');
  });

  it('unseen infected are never targeted', () => {
    const s = sim();
    const z = s.state.zombies.find((zz) => !s.state.contacts.some((c) => c.zombieId === zz.id))!;
    expect(targetAt(s.world, s.state, z.position)?.kind).not.toBe('attack');
  });
});

describe('drag-box selection', () => {
  it('selects squads with a member inside the box, in any drag direction', () => {
    const s = sim();
    const alfa = s.state.survivors.find((m) => m.squadId === 'alfa')!.position;
    const box = (dx: number) =>
      squadsInRect(s.state, { x: alfa.x + dx, y: alfa.y + dx }, { x: alfa.x - dx, y: alfa.y - dx });
    expect(box(1)).toContain('alfa');
    expect(box(-1)).toContain('alfa');
    expect(squadsInRect(s.state, { x: 0, y: 0 }, { x: 96, y: 96 })).toEqual(['alfa', 'bravo']);
    expect(squadsInRect(s.state, { x: 80, y: 80 }, { x: 90, y: 90 })).toEqual([]);
  });
});

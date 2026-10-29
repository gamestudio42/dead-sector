import {
  listInteractables,
  type GameCommandInput,
  type GameState,
  type OrderType,
  type Vec2,
  type World,
} from '@dead-sector/sim';

export type ClickTarget =
  | { kind: 'attack'; id: string; label: string }
  | { kind: 'interact'; id: string; label: string; interactKind: string }
  | null;

const INTERACT_LABELS: Record<string, string> = {
  cabinet: 'Recolher remédios',
  civilian: 'Resgatar a civil',
  beacon: 'Ativar o rádio',
};

/** What a right click at `p` would act on: a visible infected, an available interactable, or nothing. */
export function targetAt(world: World, state: GameState, p: Vec2): ClickTarget {
  const contact = state.contacts
    .filter((c) => c.visible)
    .map((c) => ({ c, d: Math.hypot(c.position.x - p.x, c.position.y - p.y) }))
    .filter((x) => x.d < 0.9)
    .sort((a, b) => a.d - b.d)[0];
  if (contact) return { kind: 'attack', id: contact.c.zombieId, label: 'Atacar infectado' };
  const civ = state.survivors.find((s) => s.isObjectiveCivilian);
  const civKnown =
    civ &&
    state.fog.cells[Math.floor(civ.position.y) * world.width + Math.floor(civ.position.x)] !== 0;
  const target = listInteractables(world, state)
    .filter((i) => i.available && (i.kind !== 'civilian' || civKnown))
    .map((i) => ({ i, d: Math.hypot(i.position.x - p.x, i.position.y - p.y) }))
    .filter((x) => x.d < (x.i.kind === 'door' ? 0.75 : x.i.kind === 'cabinet' ? 1.3 : 1))
    .sort((a, b) => a.d - b.d)[0];
  if (!target) return null;
  let label = INTERACT_LABELS[target.i.kind] ?? 'Interagir';
  if (target.i.kind === 'door') {
    const door = state.doors.find((d) => d.id === target.i.id);
    label = door?.locked ? 'Arrombar a porta' : door?.open ? 'Fechar a porta' : 'Abrir a porta';
  }
  return { kind: 'interact', id: target.i.id, label, interactKind: target.i.kind };
}

/**
 * Destination per squad when several squads get one move order: squads line up side by side,
 * perpendicular to the direction of travel and spaced so their formations do not overlap.
 */
export function spreadTargets(
  state: GameState,
  squadIds: string[],
  p: Vec2,
  spacing = 2.5,
): Map<string, Vec2> {
  const out = new Map<string, Vec2>();
  if (squadIds.length <= 1) {
    for (const id of squadIds) out.set(id, { x: p.x, y: p.y });
    return out;
  }
  const members = state.survivors.filter(
    (s) => s.alive && s.squadId !== null && squadIds.includes(s.squadId),
  );
  const cx = members.reduce((a, s) => a + s.position.x, 0) / Math.max(1, members.length);
  const cy = members.reduce((a, s) => a + s.position.y, 0) / Math.max(1, members.length);
  const len = Math.hypot(p.x - cx, p.y - cy) || 1;
  const px = -(p.y - cy) / len;
  const py = (p.x - cx) / len;
  // keep each squad on the side it already is, so they do not cross paths
  const side = (id: string) => {
    const m = members.filter((s) => s.squadId === id);
    const mx = m.reduce((a, s) => a + s.position.x, 0) / Math.max(1, m.length);
    const my = m.reduce((a, s) => a + s.position.y, 0) / Math.max(1, m.length);
    return (mx - cx) * px + (my - cy) * py;
  };
  const ordered = [...squadIds].sort((a, b) => side(a) - side(b));
  ordered.forEach((id, i) => {
    const k = (i - (ordered.length - 1) / 2) * spacing;
    out.set(id, { x: p.x + px * k, y: p.y + py * k });
  });
  return out;
}

export interface RightClickOptions {
  /** Append after the current order (Shift). */
  queue?: boolean;
  /** Force a movement type instead of the squad's current mode. */
  moveType?: OrderType;
}

/**
 * Translates a right click into one validated command per selected squad: known visible infected
 * → attack, interactable (door, cabinet, civilian, radio) → interact, otherwise move in the
 * squad's mode (spread side by side when several squads are selected).
 */
export function commandsForRightClick(
  world: World,
  state: GameState,
  squadIds: string[],
  p: Vec2,
  opts: RightClickOptions = {},
): GameCommandInput[] {
  const squads = squadIds
    .map((id) => state.squads.find((s) => s.id === id))
    .filter((s): s is NonNullable<typeof s> => !!s);
  const queue = opts.queue ? { queue: true } : {};
  const target = opts.moveType ? null : targetAt(world, state, p);
  if (target) {
    // interacting is a one-person job: only the first selected squad goes
    const who = target.kind === 'interact' ? squads.slice(0, 1) : squads;
    return who.map((sq) => ({
      type: 'issueOrder',
      squadId: sq.id,
      payload: { type: target.kind, targetEntityId: target.id, ...queue },
    }));
  }
  const spots = spreadTargets(
    state,
    squads.map((s) => s.id),
    p,
  );
  return squads.map((sq) => ({
    type: 'issueOrder',
    squadId: sq.id,
    payload: {
      type: opts.moveType ?? sq.moveMode,
      targetPosition: spots.get(sq.id) as Vec2,
      ...queue,
    },
  }));
}

/** Single-squad form kept for scripts and tests. */
export function commandForRightClick(
  world: World,
  state: GameState,
  squadId: string,
  p: Vec2,
): GameCommandInput | null {
  return commandsForRightClick(world, state, [squadId], p)[0] ?? null;
}

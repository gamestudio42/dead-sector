import {
  listInteractables,
  type GameCommandInput,
  type GameState,
  type Vec2,
  type World,
} from '@dead-sector/sim';

/**
 * Translates a right click into a validated command: known visible infected → attack,
 * interactable (door, cabinet, civilian, radio) → interact, otherwise move in the squad's mode.
 */
export function commandForRightClick(
  world: World,
  state: GameState,
  squadId: string,
  p: Vec2,
): GameCommandInput | null {
  const squad = state.squads.find((s) => s.id === squadId);
  if (!squad) return null;
  const contact = state.contacts
    .filter((c) => c.visible)
    .map((c) => ({ c, d: Math.hypot(c.position.x - p.x, c.position.y - p.y) }))
    .filter((x) => x.d < 0.9)
    .sort((a, b) => a.d - b.d)[0];
  if (contact)
    return {
      type: 'issueOrder',
      squadId,
      payload: { type: 'attack', targetEntityId: contact.c.zombieId },
    };
  const civ = state.survivors.find((s) => s.isObjectiveCivilian);
  const civKnown =
    civ &&
    state.fog.cells[Math.floor(civ.position.y) * world.width + Math.floor(civ.position.x)] !== 0;
  const target = listInteractables(world, state)
    .filter((i) => i.available && (i.kind !== 'civilian' || civKnown))
    .map((i) => ({ i, d: Math.hypot(i.position.x - p.x, i.position.y - p.y) }))
    .filter((x) => x.d < (x.i.kind === 'door' ? 0.75 : x.i.kind === 'cabinet' ? 1.3 : 1))
    .sort((a, b) => a.d - b.d)[0];
  if (target)
    return {
      type: 'issueOrder',
      squadId,
      payload: { type: 'interact', targetEntityId: target.i.id },
    };
  return {
    type: 'issueOrder',
    squadId,
    payload: { type: squad.moveMode, targetPosition: { x: p.x, y: p.y } },
  };
}

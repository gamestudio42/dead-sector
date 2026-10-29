import { builtInRawContent, validateContent, type ContentBundle } from '@dead-sector/content';
import {
  GameSimulation,
  createMissionState,
  makeZombie,
  createWorld,
  type Survivor,
  type Zombie,
  type ZombieStateName,
} from '../src';

const baseMission = builtInRawContent.missions[0] as Record<string, unknown>;

export interface TestScenario {
  rows: string[];
  alfaSpawn?: { x: number; y: number };
  civilian?: { x: number; y: number };
  extractionZone?: { x0: number; y0: number; x1: number; y1: number };
  beacon?: { x: number; y: number };
  cabinet?: { x: number; y: number };
  perimeter?: { x0: number; y0: number; x1: number; y1: number };
  bravo?: boolean;
}

export function testContent(sc: TestScenario): ContentBundle {
  const width = (sc.rows[0] as string).length;
  const height = sc.rows.length;
  const realMap = builtInRawContent.maps[0] as { legend: Record<string, string> };
  const squads = [
    {
      id: 'alfa',
      displayName: 'Alfa',
      memberIds: ['alfa-leader', 'alfa-marksman', 'alfa-medic', 'alfa-civilian'],
      spawn: sc.alfaSpawn ?? { x: 2.5, y: 2.5 },
      firePolicy: 'returnFire',
      moveMode: 'move',
    },
  ];
  if (sc.bravo)
    squads.push({
      id: 'bravo',
      displayName: 'Bravo',
      memberIds: ['bravo-leader', 'bravo-scout', 'bravo-mechanic', 'bravo-volunteer'],
      spawn: { x: width - 3.5, y: 2.5 },
      firePolicy: 'returnFire',
      moveMode: 'move',
    });
  const mission = {
    ...baseMission,
    id: 'test-mission',
    mapId: 'test-map',
    squads,
    civilian: {
      id: 'civilian-marta',
      name: 'Marta',
      role: 'Civil',
      position: sc.civilian ?? { x: width - 1.5, y: height - 1.5 },
      maxHealth: 60,
    },
    zombieZones: [],
    spawners: [],
    hordes: undefined,
    objectives: {
      perimeter: sc.perimeter ?? { x0: 0, y0: 0, x1: 0, y1: 0 },
      cabinet: { cell: sc.cabinet ?? { x: 0, y: 0 }, interactSeconds: 5 },
      civilianRescueSeconds: 3,
      extraction: {
        beacon: sc.beacon ?? { x: 1.5, y: height - 1.5 },
        zone: sc.extractionZone ?? { x0: 0, y0: height - 3, x1: 3, y1: height - 1 },
        activateSeconds: 2,
        holdSeconds: 20,
        activationNoise: 80,
        pulseNoise: 45,
        pulseSeconds: 5,
      },
    },
  };
  return validateContent({
    ...builtInRawContent,
    missions: [mission],
    maps: [
      {
        id: 'test-map',
        displayName: 'Test',
        width,
        height,
        cellSizeMeters: 1,
        legend: realMap.legend,
        rows: sc.rows,
      },
    ],
  });
}

export function testSim(sc: TestScenario, seed = 1): GameSimulation {
  const content = testContent(sc);
  return new GameSimulation(content, createMissionState(content, 'test-mission', seed));
}

export function addZombie(
  sim: GameSimulation,
  x: number,
  y: number,
  opts: { typeId?: string; state?: ZombieStateName; facing?: number } = {},
): Zombie {
  const world = createWorld(sim.content, sim.state.missionId, sim.state.doors);
  const z = makeZombie(
    world,
    `zt-${sim.state.zombies.length + 1}`,
    opts.typeId ?? 'walker',
    { x, y },
    opts.facing ?? 0,
    opts.state ?? 'idle',
    0,
  );
  z.ai.stateUntil = 1_000_000;
  sim.state.zombies.push(z);
  return z;
}

export const survivor = (sim: GameSimulation, id: string): Survivor => {
  const s = sim.state.survivors.find((x) => x.id === id);
  if (!s) throw new Error(`no survivor ${id}`);
  return s;
};

/** Removes every squad member except the given ids (kept alive), to isolate a scenario. */
export function keepOnly(sim: GameSimulation, ids: string[]): void {
  for (const s of sim.state.survivors) {
    if (s.squadId !== null && !ids.includes(s.id)) {
      s.alive = false;
      s.health = 0;
      s.activity = 'dead';
    }
  }
}

/** Open field of the given size, bordered by walls. */
export function field(w: number, h: number): string[] {
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let r = '';
    for (let x = 0; x < w; x++) r += x === 0 || y === 0 || x === w - 1 || y === h - 1 ? '#' : ',';
    rows.push(r);
  }
  return rows;
}

export function setCell(rows: string[], x: number, y: number, c: string): void {
  const r = rows[y] as string;
  rows[y] = r.slice(0, x) + c + r.slice(x + 1);
}

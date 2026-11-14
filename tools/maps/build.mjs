#!/usr/bin/env node
/**
 * Builds the tile maps that are easier to describe as blocks than to type by hand.
 *
 *   node tools/maps/build.mjs            # writes packages/content/maps/<id>.json (then run prettier on them)
 *   node tools/maps/build.mjs --print    # prints the rows instead
 *
 * Each map is drawn with a few primitives (fill, building, door, window) on an 80×80 grid. The
 * output is plain content JSON, reviewed and committed like the hand-typed maps.
 */
import { writeFileSync } from 'node:fs';

const LEGEND = {
  '.': 'street',
  ',': 'sidewalk',
  '"': 'grass',
  ':': 'rubble',
  '#': 'wall',
  '=': 'fence',
  W: 'window',
  D: 'doorClosed',
  O: 'doorOpen',
  L: 'doorLocked',
  _: 'floor',
  P: 'parking',
  C: 'wreck',
  '*': 'bush',
  K: 'cabinet',
};

class Grid {
  constructor(w, h, fillCh) {
    this.w = w;
    this.h = h;
    this.rows = Array.from({ length: h }, () => Array(w).fill(fillCh));
  }
  set(x, y, ch) {
    if (x >= 0 && y >= 0 && x < this.w && y < this.h) this.rows[y][x] = ch;
  }
  get(x, y) {
    return this.rows[y]?.[x];
  }
  fill(x0, y0, x1, y1, ch) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.set(x, y, ch);
  }
  /** Walls on the outline, floor inside. */
  building(x0, y0, x1, y1, floor = '_') {
    this.fill(x0, y0, x1, y1, '#');
    this.fill(x0 + 1, y0 + 1, x1 - 1, y1 - 1, floor);
  }
  hline(x0, x1, y, ch) {
    this.fill(x0, y, x1, y, ch);
  }
  vline(x, y0, y1, ch) {
    this.fill(x, y0, x, y1, ch);
  }
  /** Windows every `step` cells along a wall segment (skipping corners and doors). */
  windows(x0, y0, x1, y1, step) {
    if (y0 === y1) {
      for (let x = x0; x <= x1; x += step) if (this.get(x, y0) === '#') this.set(x, y0, 'W');
    } else for (let y = y0; y <= y1; y += step) if (this.get(x0, y) === '#') this.set(x0, y, 'W');
  }
  /** Outer wall with openings where streets leave the map. */
  border(openings) {
    for (let x = 0; x < this.w; x++) {
      this.set(x, 0, '#');
      this.set(x, this.h - 1, '#');
    }
    for (let y = 0; y < this.h; y++) {
      this.set(0, y, '#');
      this.set(this.w - 1, y, '#');
    }
    for (const [x0, y0, x1, y1] of openings) this.fill(x0, y0, x1, y1, '.');
  }
  toJson(id, displayName) {
    return {
      id,
      displayName,
      width: this.w,
      height: this.h,
      cellSizeMeters: 1,
      legend: LEGEND,
      rows: this.rows.map((r) => r.join('')),
    };
  }
}

/**
 * Avenida Norte: the avenue the hordes come down from the city. A supply convoy stalled on it; a
 * gas station on the west side, a mechanic's garage on the east, a bus across the cross street and
 * a parking lot by the south exit.
 */
function avenidaNorte() {
  const g = new Grid(80, 80, '"');
  // the avenue (north–south) and the cross street (east–west)
  g.fill(32, 0, 47, 79, ',');
  g.fill(34, 0, 45, 79, '.');
  g.fill(0, 38, 79, 45, ',');
  g.fill(0, 40, 79, 43, '.');
  g.fill(34, 38, 45, 45, '.');
  g.border([
    [34, 0, 45, 0],
    [34, 79, 45, 79],
    [0, 40, 0, 43],
    [79, 40, 79, 43],
  ]);

  // the stalled convoy: four trucks, a pickup and some cars
  g.fill(36, 7, 38, 12, 'C');
  g.fill(41, 15, 43, 20, 'C');
  g.fill(36, 23, 38, 28, 'C');
  g.fill(41, 30, 43, 34, 'C');
  g.fill(37, 52, 38, 54, 'C');
  g.fill(42, 60, 43, 62, 'C');
  // a city bus across the cross street, east of the avenue
  g.fill(50, 41, 59, 42, 'C');
  g.set(25, 41, ':');
  g.set(26, 42, ':');
  g.set(62, 40, ':');

  // west: gas station (shop + forecourt with pumps)
  g.fill(2, 2, 30, 36, '"');
  g.building(5, 18, 17, 30);
  g.vline(11, 19, 24, '#');
  g.set(11, 22, 'D');
  g.set(17, 26, 'D');
  g.set(17, 21, 'W');
  g.windows(5, 22, 5, 28, 3);
  g.windows(7, 18, 15, 18, 4);
  g.windows(7, 30, 15, 30, 4);
  g.set(6, 24, 'K');
  g.set(7, 24, 'K');
  g.fill(18, 14, 31, 34, 'P');
  g.fill(23, 20, 23, 21, 'C');
  g.fill(23, 27, 23, 28, 'C');
  g.fill(27, 20, 27, 21, 'C');
  g.fill(27, 27, 27, 28, 'C');
  // houses north-west
  g.building(4, 3, 13, 10);
  g.set(13, 7, 'D');
  g.windows(6, 3, 12, 3, 3);
  g.windows(6, 10, 12, 10, 3);
  g.building(17, 3, 27, 10);
  g.set(22, 10, 'D');
  g.windows(17, 5, 17, 9, 2);
  g.windows(27, 5, 27, 9, 2);
  g.set(2, 13, '*');
  g.set(3, 14, '*');
  g.set(29, 4, '*');

  // east: the mechanic's garage (perimeter), the office at the back holds the driver
  g.building(51, 6, 72, 30);
  g.fill(52, 7, 71, 29, '_');
  g.vline(64, 21, 29, '#');
  g.hline(64, 71, 21, '#');
  g.set(64, 25, 'D');
  g.set(51, 15, 'O');
  g.set(51, 16, 'O');
  g.set(51, 25, 'D');
  g.set(72, 12, 'L');
  g.windows(54, 6, 70, 6, 4);
  g.windows(54, 30, 62, 30, 4);
  g.windows(72, 16, 72, 28, 4);
  g.windows(66, 30, 70, 30, 4);
  g.set(58, 9, 'K');
  g.set(59, 9, 'K');
  g.fill(55, 18, 57, 23, 'C'); // a car on the lift
  g.set(68, 10, ':');
  g.fill(73, 2, 77, 36, '"');
  g.fill(49, 2, 77, 4, '"');
  g.set(75, 8, '*');
  g.set(76, 20, '*');
  g.set(75, 33, '*');

  // south-west: the parking lot by the exit (extraction)
  g.fill(4, 56, 28, 74, 'P');
  g.hline(4, 28, 55, '=');
  g.vline(3, 55, 75, '=');
  g.hline(3, 28, 75, '=');
  g.fill(8, 60, 9, 62, 'C');
  g.fill(20, 66, 21, 68, 'C');
  g.fill(14, 58, 15, 59, 'C');
  g.set(12, 70, ':');
  // a shop and a house south-west of the cross street
  g.building(4, 47, 16, 52);
  g.set(10, 47, 'D');
  g.windows(6, 52, 14, 52, 4);
  g.building(19, 47, 29, 52);
  g.set(29, 50, 'D');
  g.windows(21, 47, 27, 47, 3);

  // south-east: a row of shops and a church yard
  g.building(51, 48, 74, 58);
  g.vline(59, 49, 57, '#');
  g.vline(67, 49, 57, '#');
  g.set(55, 48, 'D');
  g.set(63, 48, 'D');
  g.set(71, 48, 'D');
  g.set(59, 53, 'D');
  g.windows(53, 58, 73, 58, 4);
  g.windows(52, 48, 74, 48, 6);
  g.building(53, 63, 72, 75);
  g.set(53, 69, 'D');
  g.windows(55, 63, 71, 63, 4);
  g.windows(55, 75, 71, 75, 4);
  g.set(50, 64, '*');
  g.set(49, 72, '*');
  g.set(76, 70, '*');
  return g.toJson('avenida-norte', 'Avenida Norte');
}

/**
 * Mercadão Leste: the covered market. Rows of stalls inside a big hall, the manager's office in a
 * corner and the cold room in another, streets on every side and a loading yard west.
 */
function mercadaoLeste() {
  const g = new Grid(80, 80, ',');
  // ring of streets around the market block
  g.fill(0, 8, 79, 12, '.');
  g.fill(0, 66, 79, 70, '.');
  g.fill(6, 0, 10, 79, '.');
  g.fill(69, 0, 73, 79, '.');
  g.border([
    [6, 0, 10, 0],
    [69, 0, 73, 0],
    [6, 79, 10, 79],
    [69, 79, 73, 79],
    [0, 8, 0, 12],
    [79, 8, 79, 12],
    [0, 66, 0, 70],
    [79, 66, 79, 70],
  ]);

  // the hall
  g.building(18, 18, 62, 58);
  // manager's office (north-west) with the item, cold room (north-east) with the vendor
  g.vline(28, 19, 24, '#');
  g.hline(19, 28, 24, '#');
  g.set(24, 24, 'D');
  g.set(20, 20, 'K');
  g.set(21, 20, 'K');
  g.vline(52, 19, 24, '#');
  g.hline(52, 61, 24, '#');
  g.set(56, 24, 'D');
  // rows of stalls (shelves), with aisles between
  for (const y of [29, 35, 41, 47, 53])
    for (const [x0, x1] of [
      [21, 27],
      [31, 37],
      [43, 49],
      [53, 59],
    ])
      g.hline(x0, x1, y, 'K');
  // a collapsed stall and broken crates
  g.set(39, 38, ':');
  g.set(40, 44, ':');
  g.set(33, 50, ':');
  // doors: main entrance south, north gate, west door, east door locked
  g.set(39, 58, 'D');
  g.set(40, 58, 'D');
  g.set(40, 18, 'D');
  g.set(18, 38, 'D');
  g.set(62, 38, 'L');
  g.windows(22, 58, 36, 58, 5);
  g.windows(44, 58, 60, 58, 5);
  g.windows(30, 18, 38, 18, 4);
  g.windows(43, 18, 51, 18, 4);
  g.windows(18, 28, 18, 34, 6);
  g.windows(18, 44, 18, 56, 6);
  g.windows(62, 28, 62, 34, 6);
  g.windows(62, 44, 62, 56, 6);

  // loading yard west of the hall, with a truck and pallets
  g.fill(11, 30, 17, 50, 'P');
  g.fill(12, 33, 14, 38, 'C');
  g.set(15, 46, ':');
  // parking lot south-west (extraction) and a gas canopy south-east
  g.fill(11, 71, 30, 77, 'P');
  g.fill(14, 72, 15, 73, 'C');
  g.fill(25, 75, 26, 76, 'C');
  g.fill(1, 13, 5, 65, '"');
  g.fill(74, 13, 78, 65, '"');
  g.fill(1, 71, 5, 78, '"');
  g.fill(74, 71, 78, 78, '"');
  g.fill(1, 1, 5, 7, '"');
  g.fill(74, 1, 78, 7, '"');
  // shops across the north street
  g.building(13, 1, 30, 7);
  g.set(21, 7, 'D');
  g.windows(15, 7, 29, 7, 4);
  g.building(45, 1, 66, 7);
  g.set(55, 7, 'D');
  g.windows(47, 7, 65, 7, 4);
  // houses across the south street
  g.building(36, 71, 50, 78);
  g.set(43, 71, 'D');
  g.windows(38, 71, 49, 71, 4);
  g.building(54, 71, 66, 78);
  g.set(60, 71, 'D');
  g.windows(56, 71, 65, 71, 4);
  // street litter
  g.fill(44, 9, 46, 10, 'C');
  g.fill(70, 40, 71, 42, 'C');
  g.fill(20, 67, 22, 68, 'C');
  g.set(8, 50, ':');
  g.set(60, 68, ':');
  g.set(3, 30, '*');
  g.set(76, 25, '*');
  g.set(76, 55, '*');
  return g.toJson('mercadao-leste', 'Mercadão Leste');
}

const maps = [avenidaNorte(), mercadaoLeste()];
if (process.argv.includes('--print')) {
  for (const m of maps) console.log(`${m.id}\n${m.rows.join('\n')}\n`);
} else {
  for (const m of maps) {
    const path = new URL(`../../packages/content/maps/${m.id}.json`, import.meta.url);
    writeFileSync(path, `${JSON.stringify(m, null, 1)}\n`);
    console.log(`wrote ${m.id}`);
  }
}

// Generates the original campaign maps "Pátio da Ferrovia" and "Centro Velho" (80x80) as JSON content.
// Run: node scripts/generate-campaign-maps.mjs — outputs are committed under packages/content/maps.
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

function canvas(W, H, base) {
  const g = Array.from({ length: H }, () => Array.from({ length: W }, () => base));
  const set = (x, y, c) => {
    if (x >= 0 && y >= 0 && x < W && y < H) g[y][x] = c;
  };
  const fill = (x0, y0, x1, y1, c) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) set(x, y, c);
  };
  const box = (x0, y0, x1, y1, wall = '#', floor = '_') => {
    fill(x0, y0, x1, y1, floor);
    for (let x = x0; x <= x1; x++) {
      set(x, y0, wall);
      set(x, y1, wall);
    }
    for (let y = y0; y <= y1; y++) {
      set(x0, y, wall);
      set(x1, y, wall);
    }
  };
  const hline = (x0, x1, y, c) => fill(x0, y, x1, y, c);
  const vline = (x, y0, y1, c) => fill(x, y0, x, y1, c);
  /** Map border with open gaps (entries) given as [x0, y0, x1, y1] rectangles on the edge. */
  const border = (gaps) => {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) {
        if (x !== 0 && y !== 0 && x !== W - 1 && y !== H - 1) continue;
        if (gaps.some(([a, b, c, d]) => x >= a && x <= c && y >= b && y <= d)) continue;
        set(x, y, '#');
      }
  };
  return { g, set, fill, box, hline, vline, border };
}

function write(id, displayName, W, H, g) {
  const rows = g.map((r) => r.join(''));
  const out = { id, displayName, width: W, height: H, cellSizeMeters: 1, legend: LEGEND, rows };
  writeFileSync(
    new URL(`../packages/content/maps/${id}.json`, import.meta.url),
    JSON.stringify(out, null, 1) + '\n',
  );
  console.log(`--- ${id}\n${rows.join('\n')}`);
}

// ------------------------------------------------------------------ Pátio da Ferrovia
{
  const W = 80;
  const H = 80;
  const m = canvas(W, H, ',');
  const { set, fill, box, hline, vline } = m;

  // service roads (asphalt) crossing the yard
  fill(37, 0, 42, 79, '.');
  fill(0, 58, 79, 61, '.');
  fill(73, 0, 78, 43, '.');
  // rail corridor: ballast and rails, with freight wagons leaving crossing gaps
  fill(0, 44, 79, 49, ':');
  fill(9, 45, 17, 46, 'C');
  fill(24, 47, 33, 48, 'C');
  fill(46, 45, 55, 46, 'C');
  fill(60, 47, 70, 48, 'C');

  // SW fenced lot: start
  fill(1, 63, 24, 78, '"');
  hline(1, 24, 62, '=');
  vline(25, 62, 78, '=');
  set(18, 62, '"'); // gate north
  set(25, 70, '"'); // gate east
  for (const [x, y] of [
    [3, 64],
    [4, 64],
    [22, 77],
    [23, 76],
    [2, 77],
  ])
    set(x, y, '*');

  // NW warehouse with crate aisles
  box(3, 5, 30, 24);
  set(17, 24, 'D');
  set(30, 14, 'D');
  for (const x of [6, 12, 24]) set(x, 5, 'W');
  for (const y of [9, 19]) set(3, y, 'W');
  for (const [x0, x1, y] of [
    [6, 12, 9],
    [16, 26, 9],
    [6, 14, 14],
    [18, 27, 14],
    [6, 12, 19],
    [16, 26, 19],
  ])
    fill(x0, y, x1, y + 1, 'C');

  // control building (objective) with locked north door and inner store room
  fill(46, 21, 71, 41, ',');
  hline(46, 71, 21, '=');
  hline(46, 71, 41, '=');
  vline(46, 21, 41, '=');
  vline(71, 21, 41, '=');
  set(46, 31, ',');
  set(58, 41, ',');
  set(58, 21, ',');
  box(49, 24, 69, 38);
  set(49, 31, 'D'); // west entrance
  set(59, 24, 'L'); // north door, locked
  for (const x of [53, 56, 63, 66]) set(x, 38, 'W');
  set(69, 30, 'W');
  vline(61, 25, 37, '#');
  set(61, 33, 'D'); // store room door
  fill(66, 25, 67, 25, 'K'); // battery shelf
  fill(51, 34, 54, 35, 'C'); // desks
  for (const [x, y] of [
    [47, 23],
    [47, 39],
    [70, 39],
    [70, 23],
  ])
    set(x, y, '*');

  // signal cabin south of the tracks (person to rescue)
  box(29, 51, 36, 56);
  set(32, 51, 'D');
  set(36, 54, 'W');

  // NE freight dock (extraction)
  fill(46, 3, 71, 17, 'P');
  hline(46, 71, 18, '=');
  set(58, 18, 'P');
  set(59, 18, 'P');
  fill(48, 4, 50, 8, 'C');
  fill(64, 12, 69, 13, 'C');

  // SE container yard: lanes and cover
  for (const [x0, y0, x1, y1] of [
    [46, 64, 50, 65],
    [52, 67, 53, 74],
    [57, 64, 63, 65],
    [66, 68, 72, 69],
    [69, 52, 70, 57],
    [55, 71, 61, 72],
  ])
    fill(x0, y0, x1, y1, 'C');
  box(64, 72, 76, 77);
  set(70, 72, 'D');
  set(64, 75, 'W');

  // west sheds north of the lot
  box(3, 30, 14, 39);
  set(14, 35, 'D');
  set(8, 39, 'W');
  box(18, 30, 30, 39);
  set(24, 39, 'D');
  set(18, 34, 'W');

  m.border([
    [37, 0, 42, 0],
    [79, 58, 79, 61],
    [73, 79, 78, 79],
    [0, 58, 0, 61],
  ]);
  write('patio-da-ferrovia', 'Pátio da Ferrovia', W, H, m.g);
}

// ------------------------------------------------------------------ Centro Velho
{
  const W = 80;
  const H = 80;
  const m = canvas(W, H, ',');
  const { set, fill, box, hline, vline } = m;

  // street grid: 4-wide roads with sidewalks
  const roads = [18, 40, 60];
  for (const r of roads) {
    fill(r - 2, 0, r + 3, 79, ',');
    fill(0, r - 2, 79, r + 3, ',');
  }
  for (const r of roads) {
    fill(r - 1, 0, r + 2, 79, '.');
    fill(0, r - 1, 79, r + 2, '.');
  }

  // NW park: extraction (grass, parking for the evacuation truck)
  fill(1, 1, 15, 15, '"');
  fill(4, 4, 13, 13, 'P');
  for (const [x, y] of [
    [2, 2],
    [3, 2],
    [14, 2],
    [2, 14],
    [14, 14],
    [8, 2],
  ])
    set(x, y, '*');

  // central plaza with bushes and a dry fountain
  fill(22, 22, 37, 37, ',');
  fill(28, 28, 31, 31, '#');
  for (const [x, y] of [
    [23, 23],
    [24, 23],
    [36, 23],
    [36, 24],
    [23, 36],
    [24, 36],
    [36, 36],
    [35, 36],
    [26, 30],
    [33, 29],
  ])
    set(x, y, '*');
  for (const [x, y] of [
    [27, 25],
    [32, 34],
    [25, 33],
  ])
    set(x, y, ':');

  // clinic (objective): NE block
  fill(44, 22, 58, 37, ',');
  box(46, 24, 57, 36);
  set(51, 36, 'D'); // front door (south)
  set(46, 30, 'D'); // side door (west)
  set(57, 27, 'L'); // back door, locked
  for (const x of [48, 54]) set(x, 36, 'W');
  for (const y of [26, 33]) set(57, y, 'W');
  box(47, 25, 51, 29);
  set(49, 29, 'D'); // doctor's office
  fill(54, 25, 55, 25, 'K'); // antibiotics cabinet
  fill(52, 32, 54, 33, 'C'); // gurneys

  // generic city blocks: buildings with courtyards and alley gaps
  const blocks = [
    [0, 22, 15, 37],
    [22, 0, 37, 15],
    [44, 0, 57, 15],
    [64, 0, 79, 15],
    [64, 22, 79, 37],
    [0, 44, 15, 57],
    [22, 44, 37, 57],
    [44, 44, 57, 57],
    [64, 44, 79, 57],
    [22, 64, 37, 79],
    [44, 64, 57, 79],
    [64, 64, 79, 79],
  ];
  blocks.forEach(([x0, y0, x1, y1], i) => {
    fill(x0 + 1, y0 + 1, x1 - 1, y1 - 1, i % 3 === 0 ? '"' : ':');
    const mx = Math.floor((x0 + x1) / 2);
    const my = Math.floor((y0 + y1) / 2);
    box(x0 + 1, y0 + 1, mx - 1, my - 1);
    box(mx + 1, my + 1, x1 - 1, y1 - 1);
    set(mx - 1, Math.floor((y0 + my) / 2), 'D');
    set(Math.floor((mx + x1) / 2), my + 1, 'D');
    set(Math.floor((x0 + mx) / 2), y0 + 1, 'W');
    set(x1 - 1, Math.floor((my + y1) / 2), 'W');
    if (i % 2 === 0) set(mx + 2, y0 + 2, 'C');
  });

  // SW start: courtyard with a broken-in shop
  fill(1, 64, 15, 78, '"');
  box(2, 70, 9, 77);
  set(9, 73, 'D');
  set(5, 70, 'W');
  for (const [x, y] of [
    [13, 66],
    [14, 66],
    [12, 77],
  ])
    set(x, y, '*');

  // abandoned cars on the roads
  for (const [x0, y0, x1, y1] of [
    [19, 28, 20, 31],
    [30, 41, 33, 42],
    [41, 50, 42, 53],
    [50, 18, 53, 19],
    [61, 30, 62, 33],
    [26, 60, 29, 61],
    [8, 40, 11, 41],
  ])
    fill(x0, y0, x1, y1, 'C');

  m.border([
    [17, 0, 20, 0],
    [79, 39, 79, 42],
    [59, 79, 62, 79],
    [0, 59, 0, 62],
  ]);
  void hline;
  void vline;
  write('centro-velho', 'Centro Velho', W, H, m.g);
}

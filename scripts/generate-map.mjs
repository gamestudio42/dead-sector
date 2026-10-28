// Generates the original placeholder map "Bairro da Ferrugem" (96x96) as JSON content.
// Run: node scripts/generate-map.mjs  — output is committed under packages/content/maps.
import { writeFileSync } from 'node:fs';

const W = 96;
const H = 96;
const g = Array.from({ length: H }, () => Array.from({ length: W }, () => ','));

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

// Yards and blocks
fill(0, 0, 41, 41, '"'); // NW residential yards
fill(54, 0, 95, 41, ','); // NE market square (concrete)
fill(0, 54, 41, 95, '"'); // SW
fill(54, 54, 95, 95, ','); // SE

// Streets (cross) and sidewalks
fill(0, 42, 95, 43, ',');
fill(0, 52, 95, 53, ',');
fill(42, 0, 43, 95, ',');
fill(52, 0, 53, 95, ',');
fill(0, 44, 95, 51, '.');
fill(44, 0, 51, 95, '.');

// Debris on the crossroads
for (const [x, y] of [
  [46, 40],
  [47, 40],
  [49, 55],
  [50, 56],
  [38, 47],
  [39, 48],
  [60, 49],
  [61, 49],
  [47, 70],
  [48, 71],
  [46, 86],
])
  set(x, y, ':');
// Wrecked cars on streets (block movement, not sight)
fill(45, 30, 46, 33, 'C');
fill(49, 60, 50, 63, 'C');
fill(30, 45, 33, 46, 'C');
fill(66, 48, 69, 49, 'C');
fill(46, 78, 47, 81, 'C');

// --- NW block: start yard, houses and the alley (Viela) ---
hline(1, 19, 11, '='); // start yard south fence
hline(24, 41, 41, '='); // east yard fence along sidewalk
set(33, 41, '"'); // gate
hline(0, 18, 41, '=');
set(8, 41, '"');
vline(41, 16, 40, '=');
set(41, 24, '"');
box(3, 14, 17, 25);
set(10, 25, 'D');
set(10, 14, 'O');
set(3, 19, 'W');
set(17, 19, 'W');
box(26, 3, 39, 14);
set(32, 14, 'D');
set(26, 8, 'W');
set(39, 8, 'W');
box(26, 20, 39, 37);
set(26, 30, 'D');
set(39, 26, 'W');
set(39, 32, 'W');
vline(32, 21, 36, '#');
set(32, 28, 'O');
// Alley walls x=19 and x=23, floor x=20..22 from y=12 to y=41
vline(19, 12, 41, '#');
vline(23, 12, 41, '#');
fill(20, 11, 22, 41, ':');
fill(20, 12, 22, 40, ',');
for (const [x, y] of [
  [21, 18],
  [20, 27],
  [22, 33],
])
  set(x, y, ':');
set(20, 22, '*');
set(22, 37, '*');
for (const [x, y] of [
  [6, 30],
  [7, 30],
  [12, 34],
  [13, 35],
  [28, 39],
  [36, 18],
  [14, 6],
  [15, 6],
  [3, 3],
])
  set(x, y, '*');

// --- NE block: abandoned market ---
box(58, 6, 90, 34);
set(58, 20, 'D');
set(74, 34, 'O');
set(90, 20, 'D');
for (const x of [64, 68, 80, 84]) set(x, 34, 'W');
set(58, 12, 'W');
set(58, 28, 'W');
for (const y of [12, 18, 24, 29]) {
  hline(62, 70, y, '=');
  hline(76, 86, y, '=');
}
fill(70, 15, 71, 16, ':');
fill(80, 26, 81, 27, ':');
fill(60, 37, 63, 38, 'C');
fill(84, 2, 87, 3, 'C');
for (const [x, y] of [
  [56, 3],
  [92, 38],
  [93, 10],
])
  set(x, y, '*');

// --- SE block: pharmacy, alley, warehouse, apartments ---
// Pharmacy perimeter (low fence) x57..81, y57..77
for (let x = 57; x <= 81; x++) {
  set(x, 57, '=');
  set(x, 77, '=');
}
for (let y = 57; y <= 77; y++) {
  set(57, y, '=');
  set(81, y, '=');
}
fill(57, 64, 57, 67, ','); // west gate
fill(81, 70, 81, 71, ','); // east gap to the alley
fill(58, 58, 80, 76, '"');
fill(58, 64, 61, 67, ','); // front path
box(62, 60, 76, 72);
set(62, 66, 'D'); // front door
set(76, 68, 'L'); // back door (locked)
set(66, 60, 'W');
set(72, 60, 'W');
set(62, 62, 'W');
set(62, 70, 'W');
vline(71, 61, 71, '#'); // storeroom partition
set(71, 64, 'D');
set(67, 61, 'K'); // medicine cabinet
set(68, 61, 'K');
fill(64, 66, 65, 67, '='); // shop counter
for (const [x, y] of [
  [60, 74],
  [78, 59],
  [79, 75],
  [59, 60],
])
  set(x, y, '*');
// East alley x82..85, warehouse x86..94
fill(82, 54, 85, 94, ',');
for (const [x, y] of [
  [83, 62],
  [84, 88],
])
  set(x, y, ':');
box(86, 56, 94, 92);
set(86, 74, 'D');
fill(88, 60, 92, 62, '=');
// South lane y78..80 between perimeter and apartments
fill(54, 78, 85, 80, ',');
box(56, 81, 80, 93);
set(68, 81, 'D');
for (const x of [60, 64, 72, 76]) set(x, 81, 'W');
vline(68, 82, 92, '#');
set(68, 87, 'O');

// --- SW block: workshop, house, parking lot (extraction) ---
hline(0, 41, 54, '=');
fill(21, 54, 25, 54, '"'); // gap into the lane
box(4, 57, 20, 72);
set(20, 64, 'D');
set(12, 72, 'O');
set(4, 64, 'W');
set(12, 57, 'W');
fill(8, 60, 10, 61, '=');
box(26, 57, 38, 70);
set(32, 70, 'D');
set(26, 63, 'W');
set(38, 63, 'W');
fill(0, 74, 41, 76, ','); // lane
hline(2, 40, 77, '=');
fill(22, 77, 24, 77, ','); // gate into the parking lot
fill(2, 78, 41, 93, 'P');
for (const [x0, y0] of [
  [5, 80],
  [5, 88],
  [30, 80],
  [34, 88],
  [28, 90],
])
  fill(x0, y0, x0 + 3, y0 + 1, 'C');
for (const [x, y] of [
  [3, 56],
  [24, 60],
  [40, 72],
  [2, 70],
])
  set(x, y, '*');

// --- Map border: walls everywhere except street ends (reinforcement entries) ---
for (let i = 0; i < W; i++) {
  for (const [x, y] of [
    [i, 0],
    [i, H - 1],
    [0, i],
    [W - 1, i],
  ]) {
    const onVStreet = x >= 44 && x <= 51;
    const onHStreet = y >= 44 && y <= 51;
    if ((y === 0 || y === H - 1) && onVStreet) continue;
    if ((x === 0 || x === W - 1) && onHStreet) continue;
    set(x, y, '#');
  }
}

const rows = g.map((r) => r.join(''));
const out = {
  id: 'bairro-da-ferrugem',
  displayName: 'Bairro da Ferrugem',
  width: W,
  height: H,
  cellSizeMeters: 1,
  legend: {
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
  },
  rows,
};
writeFileSync(
  new URL('../packages/content/maps/bairro-da-ferrugem.json', import.meta.url),
  JSON.stringify(out, null, 1) + '\n',
);
console.log(rows.join('\n'));

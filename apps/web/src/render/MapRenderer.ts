import Phaser from 'phaser';
import type { TileType } from '@dead-sector/content';
import { tileAt, type GameState, type Vec2, type World } from '@dead-sector/sim';
import { CELL, DEPTH } from './constants';

/** Terrain is painted at 2× and displayed at half scale so it stays crisp when zoomed in. */
const S = 2;
const P = CELL * S;

type Ctx = CanvasRenderingContext2D;

const hash = (x: number, y: number, k = 0): number => {
  let h = (x * 374761393 + y * 668265263 + k * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const GROUND_TILES = new Set<TileType>([
  'street',
  'sidewalk',
  'grass',
  'rubble',
  'floor',
  'parking',
  'doorClosed',
  'doorOpen',
  'doorLocked',
]);
const BLOCKERS = new Set<TileType>(['wall', 'window', 'wreck', 'bush', 'fence', 'cabinet']);

function groundType(world: World, x: number, y: number): TileType {
  const t = tileAt(world, x, y);
  if (GROUND_TILES.has(t)) return t.startsWith('door') ? 'floor' : t;
  for (const [dx, dy] of [
    [0, 1],
    [0, -1],
    [1, 0],
    [-1, 0],
    [1, 1],
    [-1, -1],
  ] as const) {
    const n = tileAt(world, x + dx, y + dy);
    if (GROUND_TILES.has(n)) return n.startsWith('door') ? 'floor' : n;
  }
  return 'sidewalk';
}

function rgb(r: number, g: number, b: number, a = 1): string {
  return `rgba(${r | 0},${g | 0},${b | 0},${a})`;
}

function paintGround(c: Ctx, world: World, x: number, y: number): void {
  const t = groundType(world, x, y);
  const px = x * P;
  const py = y * P;
  const n = hash(x, y);
  switch (t) {
    case 'street':
    case 'parking': {
      const b = t === 'parking' ? 50 : 42;
      c.fillStyle = rgb(b, b + 2, b + 6);
      c.fillRect(px, py, P, P);
      if (hash(x, y, 1) < 0.12) {
        // crack
        c.beginPath();
        let cx = px + hash(x, y, 2) * P;
        let cy = py + hash(x, y, 3) * P;
        c.moveTo(cx, cy);
        for (let i = 0; i < 4; i++) {
          cx += (hash(x + i, y, 4) - 0.5) * 18;
          cy += (hash(x, y + i, 5) - 0.5) * 18;
          c.lineTo(cx, cy);
        }
        c.strokeStyle = 'rgba(14,15,17,0.7)';
        c.lineWidth = 1;
        c.stroke();
      }
      if (hash(x, y, 6) < 0.01) {
        c.fillStyle = 'rgba(10,10,12,0.35)';
        c.beginPath();
        c.ellipse(px + 16, py + 16, 10 + n * 8, 6 + n * 5, n * 3, 0, Math.PI * 2);
        c.fill();
      }
      break;
    }
    case 'sidewalk': {
      const slab = (n - 0.5) * 6;
      c.fillStyle = rgb(70 + slab, 71 + slab, 73 + slab);
      c.fillRect(px, py, P, P);
      c.fillStyle = 'rgba(25,26,28,0.55)';
      c.fillRect(px + P - 1, py, 1, P);
      c.fillRect(px, py + P - 1, P, 1);
      if (hash(x, y, 7) < 0.08) {
        c.fillStyle = 'rgba(20,20,20,0.18)';
        c.fillRect(px + 2, py + 2, P - 5, P - 5);
      }
      // curb next to the road
      c.fillStyle = 'rgba(150,150,145,0.45)';
      if (tileAt(world, x, y + 1) === 'street') c.fillRect(px, py + P - 4, P, 3);
      if (tileAt(world, x, y - 1) === 'street') c.fillRect(px, py + 1, P, 3);
      if (tileAt(world, x + 1, y) === 'street') c.fillRect(px + P - 4, py, 3, P);
      if (tileAt(world, x - 1, y) === 'street') c.fillRect(px + 1, py, 3, P);
      break;
    }
    case 'grass': {
      c.fillStyle = rgb(44, 58, 36);
      c.fillRect(px, py, P, P);
      if (hash(x, y, 8) < 0.15) {
        c.fillStyle = 'rgba(70,58,40,0.45)';
        c.beginPath();
        c.ellipse(px + 16, py + 16, 9 + n * 6, 6 + n * 4, n * 4, 0, Math.PI * 2);
        c.fill();
      }
      for (let i = 0; i < 16; i++) {
        const gx = px + hash(x, y, 10 + i) * P;
        const gy = py + hash(x, y, 40 + i) * P;
        c.strokeStyle = i % 3 === 0 ? 'rgba(98,120,66,0.8)' : 'rgba(30,44,24,0.8)';
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(gx, gy);
        c.lineTo(gx + (hash(x, y, 70 + i) - 0.5) * 4, gy - 3 - hash(x, y, 90 + i) * 3);
        c.stroke();
      }
      break;
    }
    case 'rubble': {
      c.fillStyle = rgb(68, 60, 50);
      c.fillRect(px, py, P, P);
      for (let i = 0; i < 7; i++) {
        const sx = px + hash(x, y, 20 + i) * (P - 6);
        const sy = py + hash(x, y, 30 + i) * (P - 6);
        const s = 2 + hash(x, y, 50 + i) * 6;
        const brick = hash(x, y, 60 + i) < 0.35;
        c.fillStyle = brick ? 'rgba(120,62,46,0.9)' : rgb(90 + i * 6, 84 + i * 5, 74 + i * 4, 0.9);
        c.fillRect(sx, sy, s, s * 0.7);
        c.fillStyle = 'rgba(0,0,0,0.35)';
        c.fillRect(sx + 1, sy + s * 0.7, s, 1.2);
      }
      break;
    }
    case 'floor':
    default: {
      for (let j = 0; j < 2; j++)
        for (let i = 0; i < 2; i++) {
          const dark = (x * 2 + i + y * 2 + j) % 2 === 0;
          const b = dark ? 54 : 62;
          c.fillStyle = rgb(b + 4, b, b - 6);
          c.fillRect(px + i * 16, py + j * 16, 16, 16);
        }
      c.fillStyle = 'rgba(20,18,16,0.5)';
      c.fillRect(px, py, P, 1);
      c.fillRect(px, py, 1, P);
      if (hash(x, y, 9) < 0.18) {
        c.fillStyle = 'rgba(30,26,22,0.35)';
        c.beginPath();
        c.ellipse(px + 16, py + 16, 8 + n * 9, 5 + n * 6, n * 2, 0, Math.PI * 2);
        c.fill();
      }
    }
  }
}

function paintLitter(c: Ctx, world: World, x: number, y: number): void {
  const t = tileAt(world, x, y);
  if (t !== 'street' && t !== 'sidewalk' && t !== 'parking') return;
  const px = x * P;
  const py = y * P;
  const r = hash(x, y, 101);
  if (r < 0.012) {
    // irregular puddle: overlapping lobes with a faint sky sheen
    c.fillStyle = 'rgba(24,27,31,0.55)';
    for (let i = 0; i < 3; i++) {
      c.beginPath();
      c.ellipse(
        px + 12 + hash(x, y, 102 + i) * 10,
        py + 12 + hash(x, y, 105 + i) * 10,
        6 + hash(x, y, 108 + i) * 7,
        4 + hash(x, y, 111 + i) * 4,
        hash(x, y, 114 + i) * 3,
        0,
        Math.PI * 2,
      );
      c.fill();
    }
    c.fillStyle = 'rgba(150,160,170,0.08)';
    c.beginPath();
    c.ellipse(px + 14, py + 14, 5, 1.6, 0.5, 0, Math.PI * 2);
    c.fill();
  } else if (r < 0.04) {
    // paper / plastic scraps
    for (let i = 0; i < 3; i++) {
      c.save();
      c.translate(px + hash(x, y, 110 + i) * P, py + hash(x, y, 120 + i) * P);
      c.rotate(hash(x, y, 130 + i) * 6);
      c.fillStyle =
        i === 0
          ? 'rgba(170,166,152,0.45)'
          : i === 1
            ? 'rgba(110,60,50,0.35)'
            : 'rgba(90,100,105,0.35)';
      c.fillRect(-2.5, -1.5, 5, 3);
      c.restore();
    }
  } else if (r < 0.055 && t === 'street') {
    c.fillStyle = 'rgba(28,28,30,1)';
    c.beginPath();
    c.arc(px + 16, py + 16, 7, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = 'rgba(90,90,92,0.8)';
    c.lineWidth = 1;
    c.stroke();
    for (let i = -4; i <= 4; i += 2) {
      c.fillStyle = 'rgba(70,70,72,0.8)';
      c.fillRect(px + 12, py + 16 + i - 0.5, 8, 1);
    }
  } else if (r < 0.11) {
    // dry leaves
    for (let i = 0; i < 4; i++) {
      c.fillStyle = i % 2 ? 'rgba(110,84,40,0.6)' : 'rgba(80,70,36,0.6)';
      c.beginPath();
      c.ellipse(
        px + hash(x, y, 140 + i) * P,
        py + hash(x, y, 150 + i) * P,
        1.8,
        1,
        hash(x, y, 160 + i) * 3,
        0,
        Math.PI * 2,
      );
      c.fill();
    }
  }
}

function paintWall(c: Ctx, world: World, x: number, y: number, window: boolean): void {
  const px = x * P;
  const py = y * P;
  const n = hash(x, y);
  c.fillStyle = rgb(108 + n * 12, 98 + n * 10, 88 + n * 8);
  c.fillRect(px, py, P, P);
  // brick courses
  c.fillStyle = 'rgba(40,34,30,0.45)';
  for (let row = 0; row < 4; row++) {
    c.fillRect(px, py + row * 8 + 7, P, 1);
    const off = row % 2 ? 8 : 0;
    for (let col = off; col < P; col += 16) c.fillRect(px + col, py + row * 8, 1, 8);
  }
  const below = tileAt(world, x, y + 1);
  const above = tileAt(world, x, y - 1);
  if (above !== 'wall' && above !== 'window') {
    c.fillStyle = 'rgba(200,190,170,0.35)';
    c.fillRect(px, py, P, 2);
  }
  if (below !== 'wall' && below !== 'window') {
    // visible south face gives the wall height
    const grd = c.createLinearGradient(0, py + P - 9, 0, py + P);
    grd.addColorStop(0, 'rgba(60,52,46,1)');
    grd.addColorStop(1, 'rgba(34,30,27,1)');
    c.fillStyle = grd;
    c.fillRect(px, py + P - 9, P, 9);
  }
  if (window) {
    const vertical = tileAt(world, x, y - 1) === 'wall' || tileAt(world, x, y + 1) === 'wall';
    const gx = vertical ? px + 10 : px + 3;
    const gy = vertical ? py + 3 : py + 10;
    const gw = vertical ? 12 : P - 6;
    const gh = vertical ? P - 6 : 12;
    const grd = c.createLinearGradient(gx, gy, gx + gw, gy + gh);
    grd.addColorStop(0, 'rgb(96,132,152)');
    grd.addColorStop(1, 'rgb(50,72,88)');
    c.fillStyle = 'rgb(40,36,32)';
    c.fillRect(gx - 2, gy - 2, gw + 4, gh + 4);
    c.fillStyle = grd;
    c.fillRect(gx, gy, gw, gh);
    c.strokeStyle = 'rgba(220,240,255,0.35)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(gx + 2, gy + gh - 3);
    c.lineTo(gx + gw - 3, gy + 2);
    c.stroke();
    if (hash(x, y, 200) < 0.4) {
      c.strokeStyle = 'rgba(20,24,28,0.8)';
      c.lineWidth = 1;
      c.beginPath();
      const cx = gx + gw * hash(x, y, 201);
      const cy = gy + gh * hash(x, y, 202);
      for (let i = 0; i < 5; i++) {
        c.moveTo(cx, cy);
        const a = (i / 5) * Math.PI * 2 + n;
        c.lineTo(cx + Math.cos(a) * 9, cy + Math.sin(a) * 9);
      }
      c.stroke();
    }
  }
}

function paintFence(c: Ctx, world: World, x: number, y: number): void {
  const px = x * P;
  const py = y * P;
  const horiz = tileAt(world, x - 1, y) === 'fence' || tileAt(world, x + 1, y) === 'fence';
  c.save();
  if (!horiz) {
    c.translate(px + P / 2, py + P / 2);
    c.rotate(Math.PI / 2);
    c.translate(-(px + P / 2), -(py + P / 2));
  }
  c.fillStyle = 'rgba(0,0,0,0.6)';
  c.fillRect(px, py + 11, P, 9);
  for (let i = 0; i < 4; i++) {
    const shadeF = 0.85 + hash(x, y, 300 + i) * 0.3;
    c.fillStyle = rgb(122 * shadeF, 100 * shadeF, 68 * shadeF);
    c.fillRect(px + i * 8 + 0.5, py + 12, 7, 7);
  }
  c.fillStyle = 'rgb(78,62,42)';
  c.fillRect(px, py + 14.5, P, 2);
  c.fillStyle = 'rgb(60,48,34)';
  c.fillRect(px + 14, py + 10, 4, 11);
  c.restore();
}

function paintBush(c: Ctx, x: number, y: number): void {
  const px = x * P + 16;
  const py = y * P + 16;
  c.fillStyle = 'rgba(12,20,10,0.9)';
  c.beginPath();
  c.arc(px + 1, py + 2, 17, 0, Math.PI * 2);
  c.fill();
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + hash(x, y, 400) * 3;
    const d = 5 + hash(x, y, 410 + i) * 7;
    c.fillStyle = rgb(34 + i * 3, 56 + i * 4, 28 + i * 2);
    c.beginPath();
    c.arc(px + Math.cos(a) * d, py + Math.sin(a) * d, 7 + hash(x, y, 420 + i) * 4, 0, Math.PI * 2);
    c.fill();
  }
  for (let i = 0; i < 6; i++) {
    c.fillStyle = 'rgba(110,150,80,0.45)';
    c.beginPath();
    c.arc(
      px - 6 + hash(x, y, 430 + i) * 10,
      py - 6 + hash(x, y, 440 + i) * 10,
      2.5,
      0,
      Math.PI * 2,
    );
    c.fill();
  }
}

function paintCabinet(c: Ctx, x: number, y: number): void {
  const px = x * P;
  const py = y * P;
  c.fillStyle = 'rgb(38,52,50)';
  c.fillRect(px + 1, py + 3, P - 2, P - 8);
  c.fillStyle = 'rgb(70,104,98)';
  c.fillRect(px + 3, py + 5, P - 6, P - 12);
  const colors = ['#d9d4c4', '#c94a3c', '#5aa0c8', '#e3c06a', '#9fd0a0'];
  for (let i = 0; i < 6; i++) {
    c.fillStyle = colors[(x + y + i) % colors.length] as string;
    c.fillRect(px + 5 + (i % 3) * 8, py + 7 + Math.floor(i / 3) * 8, 6, 5);
  }
}

/** Top-down car in local coordinates (+x = front), rotated into place. */
function paintCar(
  c: Ctx,
  cx: number,
  cy: number,
  L: number,
  Wd: number,
  horizontal: boolean,
  flip: boolean,
  burnt: boolean,
  col: number[],
  hx: number,
  hy: number,
): void {
  const f = burnt ? 0.32 : 1;
  const body = rgb((col[0] as number) * f, (col[1] as number) * f, (col[2] as number) * f);
  const light = rgb(
    (col[0] as number) * f * 1.25 + 8,
    (col[1] as number) * f * 1.25 + 8,
    (col[2] as number) * f * 1.25 + 8,
  );
  const dark = rgb(
    (col[0] as number) * f * 0.6,
    (col[1] as number) * f * 0.6,
    (col[2] as number) * f * 0.6,
  );
  c.save();
  c.translate(cx, cy);
  c.rotate(
    (horizontal ? 0 : Math.PI / 2) + (flip ? Math.PI : 0) + (hash(hx, hy, 503) - 0.5) * 0.12,
  );
  const h = L / 2;
  const w = Wd / 2;
  // shadow
  c.fillStyle = 'rgba(0,0,0,0.45)';
  c.beginPath();
  c.roundRect(-h + 3, -w + 4, L, Wd, 8);
  c.fill();
  // wheels peeking out
  c.fillStyle = '#121214';
  for (const wx of [-h * 0.62, h * 0.6])
    for (const wy of [-w - 1, w - 2]) c.fillRect(wx - 4, wy, 8, 3);
  // body
  c.fillStyle = body;
  c.beginPath();
  c.roundRect(-h, -w, L, Wd, [10, 7, 7, 10]);
  c.fill();
  c.strokeStyle = 'rgba(8,8,8,0.9)';
  c.lineWidth = 1.5;
  c.stroke();
  // hood and trunk panels
  c.fillStyle = light;
  c.beginPath();
  c.roundRect(h * 0.42, -w + 3, h * 0.5, Wd - 6, 4);
  c.fill();
  c.fillStyle = dark;
  c.fillRect(h * 0.4, -w + 2, 1, Wd - 4);
  c.fillRect(-h * 0.62, -w + 2, 1, Wd - 4);
  // glass: windshield, roof, rear window
  const glass = burnt ? '#0c0b0a' : '#1d2630';
  c.fillStyle = glass;
  c.beginPath();
  c.moveTo(h * 0.36, -w + 3);
  c.lineTo(h * 0.14, -w + 4.5);
  c.lineTo(h * 0.14, w - 4.5);
  c.lineTo(h * 0.36, w - 3);
  c.closePath();
  c.fill();
  c.beginPath();
  c.moveTo(-h * 0.5, -w + 3.5);
  c.lineTo(-h * 0.36, -w + 4.5);
  c.lineTo(-h * 0.36, w - 4.5);
  c.lineTo(-h * 0.5, w - 3.5);
  c.closePath();
  c.fill();
  c.fillStyle = burnt ? '#1a1612' : light;
  c.fillRect(-h * 0.34, -w + 4, h * 0.46, Wd - 8);
  if (!burnt) {
    c.strokeStyle = 'rgba(200,220,235,0.25)';
    c.lineWidth = 1;
    c.beginPath();
    c.moveTo(h * 0.32, -w + 5);
    c.lineTo(h * 0.18, w - 6);
    c.stroke();
    c.fillStyle = 'rgba(230,225,190,0.7)';
    c.fillRect(h - 3, -w + 2, 2, 3);
    c.fillRect(h - 3, w - 5, 2, 3);
    c.fillStyle = 'rgba(150,30,25,0.8)';
    c.fillRect(-h + 1, -w + 2, 2, 3);
    c.fillRect(-h + 1, w - 5, 2, 3);
  }
  // rust, dents and soot
  for (let k = 0; k < 7; k++) {
    c.fillStyle = burnt ? 'rgba(120,60,20,0.35)' : 'rgba(100,58,30,0.4)';
    c.beginPath();
    c.arc(
      (hash(hx, hy, 510 + k) - 0.5) * L,
      (hash(hx, hy, 520 + k) - 0.5) * Wd,
      1 + hash(hx, hy, 530 + k) * 2.5,
      0,
      Math.PI * 2,
    );
    c.fill();
  }
  c.restore();
}

/** Groups adjacent wreck tiles into vehicles and paints each as one car body. */
function paintWrecks(c: Ctx, world: World): Vec2[] {
  const seen = new Uint8Array(world.width * world.height);
  const burning: Vec2[] = [];
  const palette = [
    [92, 40, 34],
    [52, 62, 78],
    [70, 70, 66],
    [36, 34, 32],
    [110, 96, 70],
  ];
  for (let y = 0; y < world.height; y++)
    for (let x = 0; x < world.width; x++) {
      const i = y * world.width + x;
      if (seen[i] || tileAt(world, x, y) !== 'wreck') continue;
      const stack = [[x, y]];
      seen[i] = 1;
      let x0 = x;
      let x1 = x;
      let y0 = y;
      let y1 = y;
      while (stack.length) {
        const [cx, cy] = stack.pop() as [number, number];
        x0 = Math.min(x0, cx);
        x1 = Math.max(x1, cx);
        y0 = Math.min(y0, cy);
        y1 = Math.max(y1, cy);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ] as const) {
          const nx = cx + dx;
          const ny = cy + dy;
          const ni = ny * world.width + nx;
          if (tileAt(world, nx, ny) === 'wreck' && !seen[ni]) {
            seen[ni] = 1;
            stack.push([nx, ny]);
          }
        }
      }
      const L = Math.max(x1 - x0 + 1, y1 - y0 + 1) * P - 6;
      const Wd = Math.min(x1 - x0 + 1, y1 - y0 + 1) * P - 8;
      const horizontal = x1 - x0 >= y1 - y0;
      const burnt = hash(x0, y0, 500) < 0.4;
      const col = palette[Math.floor(hash(x0, y0, 501) * palette.length)] as number[];
      paintCar(
        c,
        ((x0 + x1 + 1) / 2) * P,
        ((y0 + y1 + 1) / 2) * P,
        L,
        Wd,
        horizontal,
        hash(x0, y0, 502) < 0.5,
        burnt,
        col,
        x0,
        y0,
      );
      if (burnt) burning.push({ x: (x0 + x1 + 1) / 2, y: (y0 + y1 + 1) / 2 });
    }
  return burning;
}

/** Smooth value noise on a lattice of `cell` pixels (bilinear with smoothstep). */
function valueNoise(px: number, py: number, cell: number, k: number): number {
  const gx = px / cell;
  const gy = py / cell;
  const x0 = Math.floor(gx);
  const y0 = Math.floor(gy);
  let fx = gx - x0;
  let fy = gy - y0;
  fx = fx * fx * (3 - 2 * fx);
  fy = fy * fy * (3 - 2 * fy);
  const a = hash(x0, y0, k);
  const b = hash(x0 + 1, y0, k);
  const c = hash(x0, y0 + 1, k);
  const d = hash(x0 + 1, y0 + 1, k);
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

/**
 * Large-scale tonal variation (wear, dirt, sun-bleaching) plus film grain, applied per pixel so
 * no tile boundaries show. Deterministic: the map always looks the same.
 */
function weatherAndGrain(c: Ctx, w: number, h: number): void {
  const img = c.getImageData(0, 0, w, h);
  const d = img.data;
  let s = 1234567;
  // precompute the low-frequency field on a coarse grid and interpolate per pixel
  const step = 8;
  const gw = Math.ceil(w / step) + 1;
  const gh = Math.ceil(h / step) + 1;
  const field = new Float32Array(gw * gh);
  for (let y = 0; y < gh; y++)
    for (let x = 0; x < gw; x++) {
      const px = x * step;
      const py = y * step;
      field[y * gw + x] =
        (valueNoise(px, py, 220, 11) - 0.5) * 0.22 + (valueNoise(px, py, 70, 12) - 0.5) * 0.12;
    }
  for (let y = 0; y < h; y++) {
    const gy = y / step;
    const y0 = Math.floor(gy);
    const fy = gy - y0;
    for (let x = 0; x < w; x++) {
      const gx = x / step;
      const x0 = Math.floor(gx);
      const fx = gx - x0;
      const i0 = y0 * gw + x0;
      const a = field[i0] as number;
      const b = field[i0 + 1] as number;
      const cc = field[i0 + gw] as number;
      const dd = field[i0 + gw + 1] as number;
      const m = 1 + (a + (b - a) * fx + (cc - a) * fy + (a - b - cc + dd) * fx * fy);
      s = (s * 1664525 + 1013904223) | 0;
      const g = ((s >>> 24) / 255 - 0.5) * 10;
      const i = (y * w + x) * 4;
      d[i] = (d[i] as number) * m + g;
      d[i + 1] = (d[i + 1] as number) * m + g;
      d[i + 2] = (d[i + 2] as number) * m + g;
    }
  }
  c.putImageData(img, 0, 0);
}

function paintTerrain(world: World, c: Ctx): Vec2[] {
  const W = world.width;
  const H = world.height;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) paintGround(c, world, x, y);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) paintLitter(c, world, x, y);

  // lane markings on the two avenues and parking stripes
  c.fillStyle = 'rgba(190,180,120,0.55)';
  for (let y = 0; y < H; y += 3)
    if (tileAt(world, 47, y) === 'street') c.fillRect(47.85 * P, y * P + 4, 8, 18);
  for (let x = 0; x < W; x += 3)
    if (tileAt(world, x, 47) === 'street') c.fillRect(x * P + 4, 47.85 * P, 18, 8);
  c.fillStyle = 'rgba(216,212,196,0.3)';
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x += 4)
      if (tileAt(world, x, y) === 'parking' && y % 8 < 3) c.fillRect(x * P, y * P, 3, P);

  // soft drop shadows cast south-east by every blocker
  const sh = document.createElement('canvas');
  sh.width = W * P;
  sh.height = H * P;
  const sc = sh.getContext('2d') as Ctx;
  sc.fillStyle = '#000';
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const t = tileAt(world, x, y);
      if (!BLOCKERS.has(t)) continue;
      const tall = t === 'wall' || t === 'window';
      const o = tall ? 9 : 5;
      if (t === 'bush') {
        sc.beginPath();
        sc.arc(x * P + 16 + o, y * P + 16 + o, 15, 0, Math.PI * 2);
        sc.fill();
      } else if (t === 'fence') sc.fillRect(x * P + 4, y * P + 14, P, 8);
      else sc.fillRect(x * P + o, y * P + o, P, P);
    }
  c.save();
  c.globalAlpha = 0.42;
  c.filter = 'blur(4px)';
  c.drawImage(sh, 0, 0);
  c.restore();

  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      switch (tileAt(world, x, y)) {
        case 'wall':
          paintWall(c, world, x, y, false);
          break;
        case 'window':
          paintWall(c, world, x, y, true);
          break;
        case 'fence':
          paintFence(c, world, x, y);
          break;
        case 'bush':
          paintBush(c, x, y);
          break;
        case 'cabinet':
          paintCabinet(c, x, y);
          break;
        default:
          break;
      }
    }
  const burning = paintWrecks(c, world);
  weatherAndGrain(c, W * P, H * P);
  return burning;
}

/** Static terrain painted once into a canvas texture; doors are a separate dynamic layer. */
export class MapRenderer {
  private doorLayer: Phaser.GameObjects.Graphics;
  private doorKey = '';
  /** Burnt-out wrecks that smoulder (pure decoration: no sound, no gameplay effect). */
  readonly burning: Vec2[];

  constructor(
    scene: Phaser.Scene,
    private world: World,
  ) {
    const key = `terrain-${world.map.id}`;
    const cacheKey = `${key}:burning`;
    if (!scene.textures.exists(key)) {
      const tex = scene.textures.createCanvas(
        key,
        world.width * P,
        world.height * P,
      ) as Phaser.Textures.CanvasTexture;
      const burning = paintTerrain(world, tex.context);
      tex.refresh();
      scene.registry.set(cacheKey, burning);
    }
    this.burning = (scene.registry.get(cacheKey) as Vec2[] | undefined) ?? [];
    scene.add
      .image(0, 0, key)
      .setOrigin(0, 0)
      .setScale(1 / S)
      .setDepth(DEPTH.map);
    this.doorLayer = scene.add.graphics().setDepth(DEPTH.doors);
  }

  /** Crossed boards over a barricaded door or window; fewer boards as the barricade is worn down. */
  private drawPlanks(
    g: Phaser.GameObjects.Graphics,
    d: GameState['doors'][number],
    px: number,
    py: number,
    vertical: boolean,
  ): void {
    if (d.barricade <= 0) return;
    const boards = Math.max(
      1,
      Math.ceil((d.barricade / this.world.rules.barriers.barricadeHp) * 3),
    );
    for (let i = 0; i < boards; i++) {
      const off = 3 + i * 4.5;
      const tilt = i % 2 === 0 ? 2.5 : -2.5;
      g.lineStyle(3.2, 0x2a1d12, 1);
      if (vertical) g.lineBetween(px + 2, py + off - tilt, px + CELL - 2, py + off + tilt);
      else g.lineBetween(px + off - tilt, py + 2, px + off + tilt, py + CELL - 2);
      g.lineStyle(2.2, i % 2 ? 0x9a7448 : 0x8a6238, 1);
      if (vertical) g.lineBetween(px + 2, py + off - tilt, px + CELL - 2, py + off + tilt);
      else g.lineBetween(px + off - tilt, py + 2, px + off + tilt, py + CELL - 2);
    }
    g.fillStyle(0xc8c8c8, 0.9);
    if (vertical) g.fillRect(px + 3, py + 3, 1, 1).fillRect(px + CELL - 4, py + CELL - 4, 1, 1);
    else g.fillRect(px + 3, py + 3, 1, 1).fillRect(px + CELL - 4, py + CELL - 4, 1, 1);
  }

  /** Redraws doors only when any door state changed. */
  update(state: GameState): void {
    const key = state.doors
      .map(
        (d) =>
          `${d.open ? 1 : 0}${d.locked ? 1 : 0}${d.broken ? 1 : 0}${Math.ceil(d.barricade / 40)}`,
      )
      .join('');
    if (key === this.doorKey) return;
    this.doorKey = key;
    const g = this.doorLayer.clear();
    for (const d of state.doors) {
      const px = d.cell.x * CELL;
      const py = d.cell.y * CELL;
      const vertical =
        tileAt(this.world, d.cell.x, d.cell.y - 1) === 'wall' ||
        tileAt(this.world, d.cell.x, d.cell.y + 1) === 'wall';
      if (d.kind === 'window') {
        // intact glass is part of the painted terrain; only damage and planks are dynamic
        if (d.broken) {
          g.fillStyle(0x0d0f12, 0.95);
          if (vertical) g.fillRect(px + 5, py + 1.5, 6, CELL - 3);
          else g.fillRect(px + 1.5, py + 5, CELL - 3, 6);
          g.fillStyle(0xbfe6ff, 0.55)
            .fillTriangle(px + 5, py + 2, px + 8, py + 2, px + 5, py + 6)
            .fillTriangle(px + 11, py + 14, px + 8, py + 14, px + 11, py + 10);
        }
        this.drawPlanks(g, d, px, py, vertical);
        continue;
      }
      // frame posts on both wall sides
      g.fillStyle(0x2a2420);
      if (vertical) g.fillRect(px + 4, py, 8, 2).fillRect(px + 4, py + CELL - 2, 8, 2);
      else g.fillRect(px, py + 4, 2, 8).fillRect(px + CELL - 2, py + 4, 2, 8);
      if (d.broken) {
        g.fillStyle(0x5a3a26)
          .fillRect(px + 2, py + 3, 5, 2)
          .fillRect(px + 9, py + 9, 4, 2)
          .fillRect(px + 5, py + 11, 3, 3)
          .fillRect(px + 11, py + 2, 2, 4);
      } else if (d.open) {
        // leaf swung against the wall
        g.fillStyle(0x6e4a2c);
        if (vertical) g.fillRect(px + 2, py + 1, CELL - 4, 2.5);
        else g.fillRect(px + 1, py + 2, 2.5, CELL - 4);
      } else {
        g.fillStyle(0x0b0c0e);
        if (vertical) g.fillRect(px + 4.5, py, 7, CELL);
        else g.fillRect(px, py + 4.5, CELL, 7);
        g.fillStyle(0x7a5232);
        if (vertical) g.fillRect(px + 5.5, py + 1, 5, CELL - 2);
        else g.fillRect(px + 1, py + 5.5, CELL - 2, 5);
        g.fillStyle(0x94683f);
        if (vertical) g.fillRect(px + 6.5, py + 2, 1, CELL - 4);
        else g.fillRect(px + 2, py + 6.5, CELL - 4, 1);
        g.fillStyle(0xd0b070);
        if (vertical) g.fillCircle(px + 8, py + 11, 1);
        else g.fillCircle(px + 11, py + 8, 1);
        if (d.locked) {
          g.fillStyle(0x0b0c0e).fillCircle(px + 8, py + 8, 3.4);
          g.fillStyle(0xe3b341).fillRect(px + 6, py + 7.5, 4, 3);
          g.lineStyle(1, 0xe3b341).strokeCircle(px + 8, py + 7, 1.6);
        }
      }
      this.drawPlanks(g, d, px, py, vertical);
    }
  }
}

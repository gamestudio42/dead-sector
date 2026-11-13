import Phaser from 'phaser';
import looks from './characterLooks.json';
import sheets from '../../public/sprites/manifest.json';
import { CELL } from './constants';

/**
 * Top-down character sheets. The game ships sheets rendered offline in Blender
 * (tools/sprites/bake_characters.py, public/sprites); this file loads them and, for any sheet that
 * fails to load, paints a simpler one in code with the same frame layout. Every sheet faces +x so
 * the renderer rotates it by the actor's facing. Code-drawn frames are 32 px over one 16 px cell;
 * baked frames are 128 px over two cells, so limbs, guns and corpses fit.
 */
export const SPRITE_PX = 32;
export const WALK_FRAMES = 8;
/** Frames per sheet: 0..7 walk cycle, 8 attack/recoil, 9 corpse. */
export const ATTACK_FRAME = 8;
export const CORPSE_FRAME = 9;
const FRAMES = 10;

export interface SurvivorLook {
  jacket: string;
  pants: string;
  skin: string;
  hair: string;
  /** Squad armband colour, or null for civilians. */
  band: string | null;
  headgear: 'cap' | 'helmet' | 'none';
  weapon: 'pistol' | 'carbine' | 'shotgun' | 'melee' | 'none';
  medic?: boolean;
}

export interface ZombieLook {
  shirt: string;
  pants: string;
  skin: string;
  hair: string;
  lean: number;
  arms: number;
  /** Torso width multiplier (heavy infected are broad). */
  bulk?: number;
  /** Gaping mouth (screamer). */
  mouth?: boolean;
}

type Ctx = CanvasRenderingContext2D;

function ellipse(
  c: Ctx,
  x: number,
  y: number,
  rx: number,
  ry: number,
  fill: string,
  rot = 0,
): void {
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  c.fillStyle = fill;
  c.fill();
}

function stroke(c: Ctx, color: string, w: number): void {
  c.lineWidth = w;
  c.strokeStyle = color;
  c.stroke();
}

function limb(
  c: Ctx,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  w: number,
  color: string,
): void {
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.lineCap = 'round';
  c.lineWidth = w + 1.6;
  c.strokeStyle = '#0b0c0e';
  c.stroke();
  c.lineWidth = w;
  c.strokeStyle = color;
  c.stroke();
}

function shade(hex: string, f: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (s: number) => Math.max(0, Math.min(255, Math.round(((n >> s) & 255) * f)));
  return `rgb(${ch(16)},${ch(8)},${ch(0)})`;
}

function boot(c: Ctx, x: number, y: number, pants: string): void {
  c.beginPath();
  c.ellipse(x, y, 3.4, 2, 0, 0, Math.PI * 2);
  c.fillStyle = '#17181a';
  c.fill();
  ellipse(c, x - 1, y, 2.2, 1.6, shade(pants, 0.8));
}

/** Feet swing along the facing axis; returns [left, right] forward offsets for the frame. */
function stride(frame: number, amp: number): [number, number] {
  const ph = (frame / WALK_FRAMES) * Math.PI * 2;
  return [Math.sin(ph) * amp, -Math.sin(ph) * amp];
}

function drawSurvivor(c: Ctx, look: SurvivorLook, frame: number): void {
  const cx = 16;
  const cy = 16;
  if (frame === CORPSE_FRAME) {
    drawCorpse(c, look.jacket, look.pants, look.skin, look.hair);
    return;
  }
  const walking = frame < WALK_FRAMES;
  const [fl, fr] = walking ? stride(frame, 5.6) : [1.5, -1.5];
  // boots step out in front of / behind the torso so the walk cycle reads from above
  boot(c, cx + fl - 1, cy - 3.4, look.pants);
  boot(c, cx + fr - 1, cy + 3.4, look.pants);
  // upper body counter-rotates with the stride
  const twist = walking
    ? Math.sin((frame / WALK_FRAMES) * Math.PI * 2) * (look.weapon === 'none' ? 0.18 : 0.12)
    : 0;
  c.save();
  c.translate(cx, cy);
  c.rotate(twist);
  c.translate(-cx, -cy);
  // torso (shoulders across the y axis)
  c.beginPath();
  c.ellipse(cx - 1, cy, 4.6, 7.4, 0, 0, Math.PI * 2);
  c.fillStyle = look.jacket;
  c.fill();
  stroke(c, '#0b0c0e', 1.3);
  // jacket fold highlight
  ellipse(c, cx - 0.4, cy - 2.4, 2.2, 3.4, shade(look.jacket, 1.25));
  if (look.medic) {
    c.fillStyle = '#d8343a';
    c.fillRect(cx - 3, cy - 0.8, 3.2, 1.6);
    c.fillRect(cx - 2.2, cy - 1.6, 1.6, 3.2);
  }
  if (look.band) {
    c.fillStyle = look.band;
    c.fillRect(cx - 3.5, cy - 7.6, 3, 2.4);
    c.fillRect(cx - 3.5, cy + 5.2, 3, 2.4);
  }
  // arms and weapon
  const recoil = frame === ATTACK_FRAME ? -1.5 : 0;
  const swing = walking ? Math.sin((frame / WALK_FRAMES) * Math.PI * 2) * 2 : 0;
  switch (look.weapon) {
    case 'carbine':
    case 'shotgun': {
      const len = look.weapon === 'carbine' ? 13 : 11;
      const w = look.weapon === 'carbine' ? 2.2 : 2.8;
      limb(c, cx, cy - 5.5, cx + 6 + recoil, cy - 1, 2.6, look.jacket);
      limb(c, cx, cy + 5.5, cx + 9 + recoil, cy + 0.5, 2.6, look.jacket);
      c.fillStyle = '#16181b';
      c.fillRect(cx + 3 + recoil, cy - w / 2, len, w);
      c.fillStyle = look.weapon === 'shotgun' ? '#5b3b22' : '#2a2e33';
      c.fillRect(cx + 1 + recoil, cy - w / 2 - 0.3, 4, w + 0.6);
      ellipse(c, cx + 6 + recoil, cy - 1, 1.6, 1.6, look.skin);
      ellipse(c, cx + 9 + recoil, cy + 0.5, 1.6, 1.6, look.skin);
      break;
    }
    case 'pistol':
      limb(c, cx, cy - 5.5, cx + 8.5 + recoil, cy - 0.6, 2.4, look.jacket);
      limb(c, cx, cy + 5.5, cx + 8.5 + recoil, cy + 0.6, 2.4, look.jacket);
      ellipse(c, cx + 8.6 + recoil, cy, 1.9, 1.9, look.skin);
      c.fillStyle = '#121416';
      c.fillRect(cx + 9 + recoil, cy - 1, 5, 2);
      break;
    case 'melee': {
      const strike = frame === ATTACK_FRAME;
      limb(c, cx, cy - 5.5, cx + 3 + swing, cy - 8, 2.4, look.jacket);
      limb(c, cx, cy + 5.5, cx + (strike ? 9 : 6), cy + (strike ? 0 : 5), 2.4, look.jacket);
      ellipse(c, cx + (strike ? 9 : 6), cy + (strike ? 0 : 5), 1.7, 1.7, look.skin);
      c.beginPath();
      c.moveTo(cx + (strike ? 9 : 6), cy + (strike ? 0 : 5));
      c.lineTo(cx + (strike ? 16 : 9), cy + (strike ? -6 : 13));
      c.lineCap = 'round';
      c.lineWidth = 2.4;
      c.strokeStyle = '#6d4a2c';
      c.stroke();
      ellipse(c, cx + 3 + swing, cy - 8, 1.6, 1.6, look.skin);
      break;
    }
    default:
      limb(c, cx - 1, cy - 6, cx + 1.5 + swing, cy - 8, 2.4, look.jacket);
      limb(c, cx - 1, cy + 6, cx + 1.5 - swing, cy + 8, 2.4, look.jacket);
      ellipse(c, cx + 1.8 + swing, cy - 8.2, 1.6, 1.6, look.skin);
      ellipse(c, cx + 1.8 - swing, cy + 8.2, 1.6, 1.6, look.skin);
  }
  c.restore();
  // head
  c.beginPath();
  c.arc(cx + 0.5, cy, 3.9, 0, Math.PI * 2);
  c.fillStyle = look.skin;
  c.fill();
  stroke(c, '#0b0c0e', 1.1);
  if (look.headgear === 'helmet') {
    c.beginPath();
    c.arc(cx + 0.2, cy, 4.2, 0, Math.PI * 2);
    c.fillStyle = shade(look.jacket, 0.8);
    c.fill();
    stroke(c, '#0b0c0e', 1);
    ellipse(c, cx - 0.6, cy - 1.2, 1.6, 1.2, shade(look.jacket, 1.2));
  } else if (look.headgear === 'cap') {
    c.beginPath();
    c.arc(cx - 0.2, cy, 3.9, Math.PI * 0.5, Math.PI * 1.5);
    c.fillStyle = shade(look.jacket, 0.75);
    c.fill();
    c.fillRect(cx + 1.5, cy - 2.5, 3.2, 5);
  } else {
    c.beginPath();
    c.arc(cx - 0.4, cy, 3.6, Math.PI * 0.45, Math.PI * 1.55);
    c.fillStyle = look.hair;
    c.fill();
  }
}

function drawZombie(c: Ctx, look: ZombieLook, frame: number): void {
  const cx = 15;
  const cy = 16;
  if (frame === CORPSE_FRAME) {
    drawCorpse(c, look.shirt, look.pants, look.skin, look.hair, true);
    return;
  }
  const walking = frame < WALK_FRAMES;
  const [fl, fr] = walking ? stride(frame, 3.8 + look.lean) : [0.5, -0.5];
  const sway = walking ? Math.sin((frame / WALK_FRAMES) * Math.PI * 2) * 1.2 : 0;
  // dragging gait: one foot steps further than the other
  boot(c, cx + fl * 1.15 - 1, cy - 3.2, look.pants);
  boot(c, cx + fr * 0.7 - 1, cy + 3.2, look.pants);
  // hunched torso, asymmetric shoulders
  c.beginPath();
  const bulk = look.bulk ?? 1;
  c.ellipse(cx - 0.5 + look.lean, cy + sway * 0.4, 4.4 * bulk, 7.2 * bulk, 0.12, 0, Math.PI * 2);
  c.fillStyle = look.shirt;
  c.fill();
  stroke(c, '#0b0c0e', 1.3);
  // torn stains
  ellipse(c, cx - 1.5, cy + 3, 1.8, 1.3, '#3d1d1a');
  ellipse(c, cx + 1, cy - 4, 1.2, 1, '#2b1a14');
  // outstretched arms (lunge further on the attack frame)
  const reach = (frame === ATTACK_FRAME ? 13 : 9) + look.arms;
  limb(c, cx, cy - 5.5, cx + reach + sway, cy - 4.2, 2.3, look.skin);
  limb(c, cx, cy + 5.5, cx + reach - 1.5 - sway, cy + 4.4, 2.3, look.skin);
  // fingers
  for (const [hx, hy] of [
    [cx + reach + sway, cy - 4.2],
    [cx + reach - 1.5 - sway, cy + 4.4],
  ] as const) {
    c.fillStyle = shade(look.skin, 0.75);
    c.fillRect(hx, hy - 1.2, 2, 0.8);
    c.fillRect(hx, hy + 0.4, 2, 0.8);
  }
  // head pushed forward
  c.beginPath();
  c.arc(cx + 2 + look.lean, cy + sway * 0.3, 3.7, 0, Math.PI * 2);
  c.fillStyle = look.skin;
  c.fill();
  stroke(c, '#0b0c0e', 1.1);
  c.beginPath();
  c.arc(cx + 1.4 + look.lean, cy + sway * 0.3, 3.4, Math.PI * 0.55, Math.PI * 1.45);
  c.fillStyle = look.hair;
  c.fill();
  ellipse(c, cx + 4.3 + look.lean, cy - 1.2 + sway * 0.3, 0.7, 0.6, '#d9d26a');
  ellipse(c, cx + 4.3 + look.lean, cy + 1.2 + sway * 0.3, 0.7, 0.6, '#d9d26a');
  if (look.mouth) {
    // stretched, screaming jaw
    ellipse(c, cx + 5.4 + look.lean, cy + sway * 0.3, 1.5, 1.9, '#2a0806');
    ellipse(c, cx + 5.6 + look.lean, cy + sway * 0.3, 0.8, 1.1, '#6a1410');
  }
}

/** Body lying on the ground, limbs sprawled. */
function drawCorpse(
  c: Ctx,
  top: string,
  pants: string,
  skin: string,
  hair: string,
  infected = false,
): void {
  const cx = 16;
  const cy = 16;
  limb(c, cx - 2, cy - 2, cx - 11, cy - 6, 2.6, pants);
  limb(c, cx - 2, cy + 2, cx - 10, cy + 6, 2.6, pants);
  limb(c, cx + 3, cy - 4, cx + 6, cy - 11, 2.2, infected ? skin : top);
  limb(c, cx + 3, cy + 4, cx + 9, cy + 8, 2.2, infected ? skin : top);
  c.beginPath();
  c.ellipse(cx + 1, cy, 6.5, 4.6, 0.15, 0, Math.PI * 2);
  c.fillStyle = shade(top, 0.8);
  c.fill();
  stroke(c, '#0b0c0e', 1.2);
  c.beginPath();
  c.arc(cx + 9, cy - 1, 3.4, 0, Math.PI * 2);
  c.fillStyle = shade(skin, 0.8);
  c.fill();
  stroke(c, '#0b0c0e', 1);
  c.beginPath();
  c.arc(cx + 9.6, cy - 1, 3.1, -Math.PI * 0.5, Math.PI * 0.5);
  c.fillStyle = hair;
  c.fill();
}

function makeSheet(scene: Phaser.Scene, key: string, draw: (c: Ctx, frame: number) => void): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(
    key,
    SPRITE_PX * FRAMES,
    SPRITE_PX,
  ) as Phaser.Textures.CanvasTexture;
  const c = tex.context;
  for (let f = 0; f < FRAMES; f++) {
    c.save();
    c.translate(f * SPRITE_PX, 0);
    c.beginPath();
    c.rect(0, 0, SPRITE_PX, SPRITE_PX);
    c.clip();
    draw(c, f);
    c.restore();
    tex.add(f, 0, f * SPRITE_PX, 0, SPRITE_PX, SPRITE_PX);
  }
  tex.refresh();
}

/** Soft radial gradient textures used for lights, shadows and particles. */
function makeRadial(
  scene: Phaser.Scene,
  key: string,
  size: number,
  stops: [number, string][],
): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, size, size) as Phaser.Textures.CanvasTexture;
  const c = tex.context;
  const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) g.addColorStop(o, col);
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
  tex.refresh();
}

/** Forward-facing light cone (apex at the left-centre, opening towards +x). */
function makeCone(scene: Phaser.Scene, key: string, size: number, halfAngle: number): void {
  if (scene.textures.exists(key)) return;
  const tex = scene.textures.createCanvas(key, size, size) as Phaser.Textures.CanvasTexture;
  const c = tex.context;
  const cx = size / 2;
  const cy = size / 2;
  const g = c.createRadialGradient(cx, cy, 0, cx, cy, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.55)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  c.beginPath();
  c.moveTo(cx, cy);
  c.arc(cx, cy, size / 2, -halfAngle, halfAngle);
  c.closePath();
  c.fillStyle = g;
  c.filter = 'blur(6px)';
  c.fill();
  tex.refresh();
}

function makeBlood(scene: Phaser.Scene, key: string, seed: number): void {
  if (scene.textures.exists(key)) return;
  const size = 48;
  const tex = scene.textures.createCanvas(key, size, size) as Phaser.Textures.CanvasTexture;
  const c = tex.context;
  let s = seed;
  const rnd = () => {
    s = (s * 1103515245 + 12345) & 0x7fffffff;
    return s / 0x7fffffff;
  };
  for (let i = 0; i < 9; i++) {
    const a = rnd() * Math.PI * 2;
    const d = rnd() * 10;
    ellipse(
      c,
      24 + Math.cos(a) * d,
      24 + Math.sin(a) * d,
      3 + rnd() * 7,
      2 + rnd() * 5,
      'rgba(92,14,14,0.55)',
      rnd() * 3,
    );
  }
  for (let i = 0; i < 10; i++) {
    const a = rnd() * Math.PI * 2;
    const d = 12 + rnd() * 10;
    ellipse(
      c,
      24 + Math.cos(a) * d,
      24 + Math.sin(a) * d,
      0.8 + rnd() * 1.4,
      0.8 + rnd() * 1.2,
      'rgba(110,18,16,0.7)',
    );
  }
  tex.refresh();
}

/** Colours and gear per survivor template, shared with the Blender bake. */
export const SURVIVOR_LOOKS = looks.survivors as Record<string, SurvivorLook>;
const ZOMBIE_LOOKS: ZombieLook[] = looks.walkers;
const RUNNER_LOOK: ZombieLook = looks.runner;

export const WALKER_VARIANTS = ZOMBIE_LOOKS.length;

export function survivorTextureKey(templateId: string, civilian: boolean): string {
  return civilian
    ? 'sv-civilian'
    : `sv-${SURVIVOR_LOOKS[templateId] ? templateId : 'alfa-civilian'}`;
}

const HEAVY_LOOK: ZombieLook = looks.heavy;
const SCREAMER_LOOK: ZombieLook = looks.screamer;

/** Display scale per infected type relative to a survivor (heavy ones tower over people). */
export const ZOMBIE_SCALE: Record<string, number> = { heavy: 1.35, screamer: 0.95 };

export function zombieTextureKey(typeId: string, id: string): string {
  if (typeId === 'runner') return 'zb-runner';
  if (typeId === 'heavy') return 'zb-heavy';
  if (typeId === 'screamer') return 'zb-screamer';
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return `zb-walker-${Math.abs(h) % ZOMBIE_LOOKS.length}`;
}

const baked = new Set<string>();

/** Queues the baked character sheets; one that fails to load is painted in code instead. */
export function loadCharacterSheets(scene: Phaser.Scene): void {
  for (const key of Object.keys(sheets.sheets))
    scene.load.spritesheet(key, `./sprites/${key}.png`, {
      frameWidth: sheets.frameSize,
      frameHeight: sheets.frameSize,
    });
}

/** Display scale that makes a character sheet's frames the right size on the map. */
export function spriteScale(key: string): number {
  return baked.has(key) ? CELL / sheets.pxPerCell : CELL / SPRITE_PX;
}

/** Generates every missing sheet once per game (textures survive scene restarts). */
export function buildSpriteTextures(
  scene: Phaser.Scene,
  weaponByTemplate: Record<string, string>,
): void {
  for (const key of Object.keys(sheets.sheets)) if (scene.textures.exists(key)) baked.add(key);
  for (const [id, base] of Object.entries(SURVIVOR_LOOKS)) {
    const w = weaponByTemplate[id];
    const look: SurvivorLook =
      w === 'pistol' || w === 'carbine' || w === 'shotgun' || w === 'melee'
        ? { ...base, weapon: w }
        : base;
    makeSheet(scene, id === 'civilian' ? 'sv-civilian' : `sv-${id}`, (c, f) =>
      drawSurvivor(c, look, f),
    );
  }
  ZOMBIE_LOOKS.forEach((look, i) =>
    makeSheet(scene, `zb-walker-${i}`, (c, f) => drawZombie(c, look, f)),
  );
  makeSheet(scene, 'zb-runner', (c, f) => drawZombie(c, RUNNER_LOOK, f));
  makeSheet(scene, 'zb-heavy', (c, f) => drawZombie(c, HEAVY_LOOK, f));
  makeSheet(scene, 'zb-screamer', (c, f) => drawZombie(c, SCREAMER_LOOK, f));

  makeRadial(scene, 'fx-light', 128, [
    [0, 'rgba(255,255,255,1)'],
    [0.45, 'rgba(255,255,255,0.6)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  makeRadial(scene, 'fx-shadow', 32, [
    [0, 'rgba(0,0,0,0.55)'],
    [0.6, 'rgba(0,0,0,0.3)'],
    [1, 'rgba(0,0,0,0)'],
  ]);
  makeRadial(scene, 'fx-puff', 32, [
    [0, 'rgba(255,255,255,0.9)'],
    [0.5, 'rgba(255,255,255,0.35)'],
    [1, 'rgba(255,255,255,0)'],
  ]);
  makeRadial(scene, 'fx-flash', 32, [
    [0, 'rgba(255,250,220,1)'],
    [0.3, 'rgba(255,200,90,0.9)'],
    [1, 'rgba(255,120,20,0)'],
  ]);
  makeRadial(scene, 'fx-glow', 64, [
    [0, 'rgba(255,190,110,0.75)'],
    [0.4, 'rgba(255,140,60,0.3)'],
    [1, 'rgba(255,100,40,0)'],
  ]);
  makeCone(scene, 'fx-cone', 256, 0.5);
  if (!scene.textures.exists('fx-dot')) {
    const tex = scene.textures.createCanvas('fx-dot', 4, 4) as Phaser.Textures.CanvasTexture;
    tex.context.fillStyle = '#fff';
    tex.context.fillRect(0, 0, 4, 4);
    tex.refresh();
  }
  for (let i = 0; i < 4; i++) makeBlood(scene, `fx-blood-${i}`, 97 + i * 131);
}

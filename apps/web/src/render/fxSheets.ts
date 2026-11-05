import Phaser from 'phaser';
import manifest from '../../public/fx/manifest.json';

/**
 * Combat effects baked offline with EffectCraft (tools/vfx). Each one is a horizontal strip of
 * frames in public/fx, described by the manifest the bake wrote after checking its alpha.
 */
export type FxName = keyof typeof manifest.effects;

const sheetKey = (name: FxName) => `fx-sheet-${name}`;
export const fxAnimKey = (name: FxName) => `fx-anim-${name}`;

export function loadFxSheets(scene: Phaser.Scene): void {
  for (const [name, e] of Object.entries(manifest.effects))
    scene.load.spritesheet(sheetKey(name as FxName), `./fx/${name}.png`, {
      frameWidth: e.frameWidth,
      frameHeight: e.frameHeight,
    });
}

/** Registers one animation per loaded sheet; a sheet that failed to load is skipped. */
export function createFxAnims(scene: Phaser.Scene): void {
  for (const [name, e] of Object.entries(manifest.effects)) {
    const sheet = sheetKey(name as FxName);
    const key = fxAnimKey(name as FxName);
    if (!scene.textures.exists(sheet) || scene.anims.exists(key)) continue;
    scene.anims.create({
      key,
      frames: scene.anims.generateFrameNumbers(sheet, { start: 0, end: e.frames - 1 }),
      frameRate: e.fps,
    });
  }
}

export function hasFx(scene: Phaser.Scene, name: FxName): boolean {
  return scene.anims.exists(fxAnimKey(name));
}

export const FX_SHEETS = manifest.effects;

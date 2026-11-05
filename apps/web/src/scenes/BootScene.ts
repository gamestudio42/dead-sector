import Phaser from 'phaser';
import { ContentValidationError, loadContent } from '@dead-sector/content';
import { createFxAnims, loadFxSheets } from '../render/fxSheets';
import { buildSpriteTextures } from '../render/SpriteFactory';
import { uiRoot } from '../ui/dom';
import { text } from '../ui/i18n';

/** Validates all JSON content at startup and fails with a descriptive message. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  preload(): void {
    loadFxSheets(this);
    // a missing sheet must not stop the game: the effects fall back to code-drawn particles
    this.load.on('loaderror', (file: Phaser.Loader.File) =>
      console.warn(`fx sheet missing: ${file.key}`),
    );
  }

  create(): void {
    let content: ReturnType<typeof loadContent>;
    try {
      content = loadContent();
    } catch (err) {
      const msg = err instanceof ContentValidationError ? err.message : String(err);
      uiRoot().innerHTML = `<div class="screen"><div class="card panel"><h2>${text('boot.invalid')}</h2><div class="error-box">${msg.replace(/</g, '&lt;')}</div></div></div>`;
      return;
    }
    const weapons: Record<string, string> = {};
    for (const [id, t] of Object.entries(content.survivors)) weapons[id] = t.weaponId;
    buildSpriteTextures(this, weapons);
    createFxAnims(this);
    this.scene.start('Menu');
  }
}

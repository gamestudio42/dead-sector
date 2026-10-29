import Phaser from 'phaser';
import { ContentValidationError, loadContent } from '@dead-sector/content';
import { buildSpriteTextures } from '../render/SpriteFactory';
import { uiRoot } from '../ui/dom';

/** Validates all JSON content at startup and fails with a descriptive message. */
export class BootScene extends Phaser.Scene {
  constructor() {
    super('Boot');
  }

  create(): void {
    let content: ReturnType<typeof loadContent>;
    try {
      content = loadContent();
    } catch (err) {
      const msg = err instanceof ContentValidationError ? err.message : String(err);
      uiRoot().innerHTML = `<div class="screen"><div class="card panel"><h2>Conteúdo inválido</h2><div class="error-box">${msg.replace(/</g, '&lt;')}</div></div></div>`;
      return;
    }
    const weapons: Record<string, string> = {};
    for (const [id, t] of Object.entries(content.survivors)) weapons[id] = t.weaponId;
    buildSpriteTextures(this, weapons);
    this.scene.start('Menu');
  }
}

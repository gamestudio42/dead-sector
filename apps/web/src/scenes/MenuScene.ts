import Phaser from 'phaser';
import { loadContent } from '@dead-sector/content';
import { AudioEngine } from '../audio/AudioEngine';
import { Backdrop } from '../render/Backdrop';
import { clearUi, uiRoot } from '../ui/dom';
import { openOptions } from '../ui/OptionsPanel';
import { applyContrast, SaveStore } from '../ui/SaveStore';

export const MISSION_ID = 'a-ultima-farmacia';
export const QUICKSAVE = 'quicksave';

/** Title screen over a live, decorative view of the mission map. */
export class MenuScene extends Phaser.Scene {
  private backdrop: Backdrop | null = null;

  constructor() {
    super('Menu');
  }

  create(): void {
    applyContrast();
    this.backdrop = new Backdrop(this, MISSION_ID);
    const mission = loadContent().missions[MISSION_ID]!;
    clearUi();
    const screen = document.createElement('div');
    screen.className = 'screen title-screen';
    screen.innerHTML = `
      <div class="title-block" data-testid="menu">
        <h1 class="title">DEAD <span>SECTOR</span></h1>
        <div class="subtitle">Tática em tempo real pausável</div>
        <nav class="menu-buttons">
          <button data-act="new" data-testid="btn-new-mission"><b>Nova missão</b><small>${mission.displayName} · Bairro da Ferrugem</small></button>
          <button data-act="continue" data-testid="btn-continue" disabled><b>Continuar</b><small>Salvamento rápido</small></button>
          <button data-act="options" data-testid="btn-menu-options"><b>Opções</b><small>Áudio, vídeo, acessibilidade e controles</small></button>
        </nav>
        <p class="tagline">Cada disparo é ouvido. Cada decisão cobra seu preço.</p>
      </div>
      <div class="build-note small">Protótipo · arte e som originais gerados em código</div>`;
    uiRoot().appendChild(screen);
    const q = <T extends HTMLElement>(sel: string) => screen.querySelector(sel) as T;
    const audio = AudioEngine.get();
    q('[data-act=new]').onclick = () => {
      audio.uiClick();
      this.scene.start('Briefing');
    };
    q('[data-act=options]').onclick = () => {
      audio.uiClick();
      screen.style.visibility = 'hidden';
      openOptions(() => (screen.style.visibility = ''));
    };
    const cont = q<HTMLButtonElement>('[data-act=continue]');
    void SaveStore.load(QUICKSAVE).then((data) => {
      if (!data) return;
      cont.disabled = false;
      cont.onclick = () => this.scene.start('Tactical', { save: data });
    });
  }

  override update(_time: number, delta: number): void {
    this.backdrop?.update(delta);
  }
}

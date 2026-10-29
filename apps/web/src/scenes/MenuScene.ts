import Phaser from 'phaser';
import { loadContent } from '@dead-sector/content';
import { clearUi, uiRoot } from '../ui/dom';
import { AudioEngine } from '../audio/AudioEngine';
import { SaveStore, Settings, type LightingMode } from '../ui/SaveStore';

export const MISSION_ID = 'a-ultima-farmacia';
export const QUICKSAVE = 'quicksave';

export class MenuScene extends Phaser.Scene {
  constructor() {
    super('Menu');
  }

  create(): void {
    const mission = loadContent().missions[MISSION_ID]!;
    const root = uiRoot();
    clearUi();
    let seed = mission.canonicalSeed;
    const screen = document.createElement('div');
    screen.className = 'screen';
    screen.innerHTML = `
      <div class="card panel" data-testid="menu">
        <h1 class="title">DEAD <span>SECTOR</span></h1>
        <div class="subtitle">Tática em tempo real pausável · protótipo vertical slice</div>
        <h3>Missão: ${mission.displayName}</h3>
        <p class="briefing">${mission.briefing}</p>
        <div class="menu-buttons">
          <button data-act="new" data-testid="btn-new-mission">▶ Iniciar missão — ${mission.displayName}</button>
          <button data-act="continue" data-testid="btn-continue" disabled>⟲ Continuar do salvamento rápido</button>
          <button data-act="controls">⌨ Controles</button>
        </div>
        <div class="row small">
          <span>Semente: <b data-el="seed">${seed}</b> <span data-el="seedNote">(canônica)</span></span>
          <button data-act="seed">Nova semente</button>
          <button data-act="canon">Canônica</button>
          <span style="margin-left:auto">Escala do HUD</span>
          <select data-el="scale"><option value="1">100%</option><option value="1.25">125%</option><option value="1.5">150%</option></select>
        </div>
        <div class="settings-row small">
          <label>Volume <input type="range" min="0" max="100" step="5" data-el="volume" /></label>
          <label><input type="checkbox" data-el="muted" /> Sem som</label>
          <label><input type="checkbox" data-el="blood" /> Sangue</label>
          <label>Iluminação <select data-el="lighting"><option value="dusk">Crepúsculo</option><option value="day">Dia</option></select></label>
        </div>
        <div data-el="controls" style="display:none; margin-top:14px">
          <div class="controls-grid">
            <span class="kbd">Clique esq.</span><span>Selecionar esquadrão (ou cartão à esquerda)</span>
            <span class="kbd">Clique dir.</span><span>Mover no modo atual · sobre infectado: atacar · sobre porta, armário, civil ou rádio: interagir</span>
            <span class="kbd">1–4</span><span>Selecionar esquadrão</span>
            <span class="kbd">Q / W / E</span><span>Modo furtivo / normal / correr (aplica à ordem atual)</span>
            <span class="kbd">H / T</span><span>Manter posição / esconder</span>
            <span class="kbd">R / G</span><span>Retirada / reagrupar no líder</span>
            <span class="kbd">F</span><span>Disciplina de fogo: responder → livre → cessar</span>
            <span class="kbd">Espaço</span><span>Pausar (ordens dadas em pausa executam ao retomar)</span>
            <span class="kbd">Tab</span><span>Velocidade 1× / 2×</span>
            <span class="kbd">Setas · roda</span><span>Mover câmera · zoom (botão do meio arrasta)</span>
            <span class="kbd">Esc</span><span>Menu de pausa</span>
            <span class="kbd">M</span><span>Ligar/desligar som</span>
            <span class="kbd">\`</span><span>Alternar sobreposição de depuração (ou ?debug=1)</span>
          </div>
          <p class="small">Tiros são ouvidos longe e atraem reforços pelas entradas do mapa. Furtividade e portas fechadas reduzem o ruído.</p>
        </div>
      </div>`;
    root.appendChild(screen);
    const q = <T extends HTMLElement>(sel: string) => screen.querySelector(sel) as T;
    const scale = q<HTMLSelectElement>('[data-el=scale]');
    scale.value = String(Settings.hudScale);
    document.documentElement.style.setProperty('--hud-scale', String(Settings.hudScale));
    scale.onchange = () => (Settings.hudScale = Number(scale.value));
    const volume = q<HTMLInputElement>('[data-el=volume]');
    volume.value = String(Math.round(Settings.volume * 100));
    volume.oninput = () => {
      Settings.volume = Number(volume.value) / 100;
      AudioEngine.get().applySettings();
    };
    const muted = q<HTMLInputElement>('[data-el=muted]');
    muted.checked = Settings.muted;
    muted.onchange = () => {
      Settings.muted = muted.checked;
      AudioEngine.get().applySettings();
    };
    const blood = q<HTMLInputElement>('[data-el=blood]');
    blood.checked = Settings.blood;
    blood.onchange = () => (Settings.blood = blood.checked);
    const lighting = q<HTMLSelectElement>('[data-el=lighting]');
    lighting.value = Settings.lighting;
    lighting.onchange = () => (Settings.lighting = lighting.value as LightingMode);
    const setSeed = (s: number, canon: boolean) => {
      seed = s;
      q('[data-el=seed]').textContent = String(s);
      q('[data-el=seedNote]').textContent = canon ? '(canônica)' : '(variação)';
    };
    q('[data-act=seed]').onclick = () => setSeed(Math.floor(Math.random() * 1_000_000), false);
    q('[data-act=canon]').onclick = () => setSeed(mission.canonicalSeed, true);
    q('[data-act=controls]').onclick = () => {
      const c = q('[data-el=controls]');
      c.style.display = c.style.display === 'none' ? 'block' : 'none';
    };
    q('[data-act=new]').onclick = () => this.scene.start('Tactical', { seed });
    const cont = q<HTMLButtonElement>('[data-act=continue]');
    void SaveStore.load(QUICKSAVE).then((data) => {
      if (!data) return;
      cont.disabled = false;
      cont.onclick = () => this.scene.start('Tactical', { save: data });
    });
  }
}

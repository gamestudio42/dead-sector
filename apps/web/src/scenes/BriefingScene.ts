import Phaser from 'phaser';
import { loadContent } from '@dead-sector/content';
import { AudioEngine } from '../audio/AudioEngine';
import { Backdrop } from '../render/Backdrop';
import { clearUi, uiRoot } from '../ui/dom';
import { T } from '../ui/i18n';
import { baseMap, drawMissionMarks } from '../ui/MapCanvas';
import { MISSION_ID } from './MenuScene';

const PX = 3;
const SQUAD_CSS: Record<string, string> = { alfa: '#5aa9ff', bravo: '#ffad4d' };

const INTEL = [
  'Tiros são ouvidos a quarteirões de distância e atraem reforços pelas quatro entradas do bairro.',
  'A porta dos fundos da farmácia está trancada: arrombar é possível, mas faz barulho.',
  'Ao transmitir, o rádio de extração atrai infectados até o transporte chegar.',
  'A civil está ferida e não luta: ela segue a equipe a pé depois do resgate.',
  'Furtivo e portas fechadas abafam o ruído. Corredores reagem rápido a qualquer som.',
];

const pips = (v: number) =>
  `<span class="pips" title="${v}/100">${Array.from({ length: 5 }, (_, i) => `<i class="${v >= (i + 1) * 20 - 10 ? 'on' : ''}"></i>`).join('')}</span>`;

/** Pre-mission briefing: map with known areas, objectives, intel, roster and seed choice. */
export class BriefingScene extends Phaser.Scene {
  private backdrop: Backdrop | null = null;

  constructor() {
    super('Briefing');
  }

  create(): void {
    this.backdrop = new Backdrop(this, MISSION_ID);
    const content = loadContent();
    const mission = content.missions[MISSION_ID]!;
    const world = this.backdrop.world;
    let seed = mission.canonicalSeed;
    clearUi();

    const roster = mission.squads
      .map((sq) => {
        const rows = sq.memberIds
          .map((id) => {
            const t = content.survivors[id]!;
            const w = content.weapons[t.weaponId];
            return `<tr><td>${t.isLeader ? '★ ' : ''}${t.name}</td><td>${t.role}</td><td>${w?.displayName ?? t.weaponId}</td>
              <td>${pips(t.courage)}</td><td>${pips(t.marksmanship)}</td><td>${pips(t.stealth)}</td></tr>`;
          })
          .join('');
        return `<h4 style="color:${SQUAD_CSS[sq.id]}">Esquadrão ${sq.displayName}</h4>
          <table class="roster"><tr><th>Nome</th><th>Função</th><th>Arma</th><th>Coragem</th><th>Pontaria</th><th>Furtividade</th></tr>${rows}</table>`;
      })
      .join('');

    const screen = document.createElement('div');
    screen.className = 'screen briefing-screen';
    screen.innerHTML = `
      <div class="card panel briefing-card" data-testid="briefing">
        <div class="subtitle">Briefing de operação</div>
        <h2>${mission.displayName}</h2>
        <div class="briefing-grid">
          <div class="map-col">
            <canvas data-el="map" width="${world.width * PX}" height="${world.height * PX}"></canvas>
            <div class="map-legend small">
              <span><i style="background:#5aa9ff"></i>Alfa</span><span><i style="background:#ffad4d"></i>Bravo</span>
              <span><i class="dash"></i>Perímetro da farmácia</span><span><i style="background:#7fbf6a"></i>Extração</span>
              <span><i style="background:#e0563e"></i>Entradas de infectados</span>
            </div>
          </div>
          <div class="info-col">
            <p class="briefing">${mission.briefing}</p>
            <h4>Objetivos</h4>
            <ol class="obj-list">${['enterPerimeter', 'collectMedicine', 'rescueCivilian', 'activateExtraction', 'holdExtraction'].map((id) => `<li>${T.objectives[id]}</li>`).join('')}</ol>
            <h4>Informações</h4>
            <ul class="intel">${INTEL.map((i) => `<li>${i}</li>`).join('')}</ul>
            <p class="small">Tempo limite: ${Math.round(mission.timeLimitSeconds / 60)} min · Falha se a civil morrer ou se todos caírem.</p>
          </div>
        </div>
        <details class="roster-wrap"><summary>Equipe (${mission.squads.reduce((n, s) => n + s.memberIds.length, 0)} sobreviventes)</summary>${roster}</details>
        <div class="row briefing-actions">
          <span class="small">Semente: <b data-el="seed">${seed}</b> <span data-el="seedNote">(canônica)</span></span>
          <button data-act="seed" title="Mesma missão com posições e eventos diferentes">Nova semente</button>
          <button data-act="canon">Canônica</button>
          <span style="flex:1"></span>
          <button data-act="back" data-testid="btn-back">Voltar</button>
          <button data-act="deploy" class="primary" data-testid="btn-deploy">Iniciar operação ▶</button>
        </div>
      </div>`;
    uiRoot().appendChild(screen);
    const q = <T extends HTMLElement>(sel: string) => screen.querySelector(sel) as T;

    const canvas = q<HTMLCanvasElement>('[data-el=map]');
    const g = canvas.getContext('2d') as CanvasRenderingContext2D;
    g.drawImage(baseMap(world, PX), 0, 0);
    drawMissionMarks(g, world, PX, false);
    for (const sp of mission.spawners) {
      const x = (sp.cell.x + 0.5) * PX;
      const y = (sp.cell.y + 0.5) * PX;
      g.fillStyle = '#e0563e';
      g.beginPath();
      g.arc(
        Math.min(Math.max(x, 6), canvas.width - 6),
        Math.min(Math.max(y, 6), canvas.height - 6),
        5,
        0,
        Math.PI * 2,
      );
      g.fill();
    }
    mission.squads.forEach((sq, i) => {
      const x = sq.spawn.x * PX;
      const y = sq.spawn.y * PX;
      g.fillStyle = SQUAD_CSS[sq.id] ?? '#fff';
      g.strokeStyle = '#000';
      g.lineWidth = 1.5;
      g.beginPath();
      g.arc(x, y, 6, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      // labels go below the dot, alternating left/right so neighbouring spawns never overlap
      g.font = 'bold 11px system-ui';
      g.textAlign = i % 2 === 0 ? 'right' : 'left';
      g.lineWidth = 3;
      const lx = i % 2 === 0 ? x + 2 : x - 2;
      g.strokeText(sq.displayName, lx, y + 19);
      g.fillText(sq.displayName, lx, y + 19);
      g.textAlign = 'start';
    });
    g.fillStyle = '#e9e4d6';
    g.font = 'bold 11px system-ui';
    const o = mission.objectives;
    g.fillText('FARMÁCIA', o.perimeter.x0 * PX + 4, o.perimeter.y0 * PX - 4);
    g.fillText('EXTRAÇÃO', o.extraction.zone.x0 * PX + 2, o.extraction.zone.y0 * PX - 4);

    const audio = AudioEngine.get();
    const setSeed = (s: number, canon: boolean) => {
      seed = s;
      q('[data-el=seed]').textContent = String(s);
      q('[data-el=seedNote]').textContent = canon ? '(canônica)' : '(variação)';
    };
    q('[data-act=seed]').onclick = () => setSeed(Math.floor(Math.random() * 1_000_000), false);
    q('[data-act=canon]').onclick = () => setSeed(mission.canonicalSeed, true);
    q('[data-act=back]').onclick = () => {
      audio.uiClick();
      this.scene.start('Menu');
    };
    q('[data-act=deploy]').onclick = () => {
      audio.uiClick();
      this.scene.start('Tactical', { seed });
    };
  }

  override update(_time: number, delta: number): void {
    this.backdrop?.update(delta);
  }
}

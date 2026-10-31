import Phaser from 'phaser';
import { loadContent } from '@dead-sector/content';
import { AudioEngine } from '../audio/AudioEngine';
import { Backdrop } from '../render/Backdrop';
import { clearUi, uiRoot } from '../ui/dom';
import { CampaignStore } from '../ui/CampaignStore';
import { MT, setMissionTexts, T } from '../ui/i18n';
import { baseMap, drawMissionMarks } from '../ui/MapCanvas';
import { CAMPAIGN_ID, MISSION_ID } from './MenuScene';
import {
  carryOver,
  missionSeed,
  reinforcementMultiplier,
  type CampaignState,
} from '@dead-sector/sim';

const PX = 3;
const SQUAD_CSS: Record<string, string> = { alfa: '#5aa9ff', bravo: '#ffad4d' };

const pips = (v: number) =>
  `<span class="pips" title="${v}/100">${Array.from({ length: 5 }, (_, i) => `<i class="${v >= (i + 1) * 20 - 10 ? 'on' : ''}"></i>`).join('')}</span>`;

/** Pre-mission briefing: map with known areas, objectives, intel, roster and seed choice. */
export class BriefingScene extends Phaser.Scene {
  private backdrop: Backdrop | null = null;

  constructor() {
    super('Briefing');
  }

  create(data: { missionId?: string; campaign?: boolean }): void {
    const missionId = data.missionId ?? MISSION_ID;
    const inCampaign = !!data.campaign;
    this.backdrop = new Backdrop(this, missionId);
    const content = loadContent();
    const mission = content.missions[missionId]!;
    setMissionTexts(mission.texts);
    const world = this.backdrop.world;
    let seed = mission.canonicalSeed;
    let campaign: CampaignState | null = null;
    clearUi();
    const STAGE: Record<string, string> = {
      exposed: 'exposto',
      infected: 'infectado',
      critical: 'crítico',
    };

    const roster = mission.squads
      .map((sq) => {
        const rows = sq.memberIds
          .map((id) => {
            const t = content.survivors[id]!;
            const w = content.weapons[t.weaponId];
            return `<tr data-member="${id}"><td>${t.isLeader ? '★ ' : ''}${t.name}</td><td>${t.role}</td><td>${w?.displayName ?? t.weaponId}</td>
              <td>${pips(t.courage)}</td><td>${pips(t.marksmanship)}</td><td>${pips(t.stealth)}</td><td class="state" data-state="${id}">pronto</td></tr>`;
          })
          .join('');
        return `<h4 style="color:${SQUAD_CSS[sq.id]}">Esquadrão ${sq.displayName}</h4>
          <table class="roster"><tr><th>Nome</th><th>Função</th><th>Arma</th><th>Coragem</th><th>Pontaria</th><th>Furtividade</th><th>Estado</th></tr>${rows}</table>`;
      })
      .join('');

    const screen = document.createElement('div');
    screen.className = 'screen briefing-screen';
    screen.innerHTML = `
      <div class="card panel briefing-card" data-testid="briefing">
        <div class="subtitle" data-el="kicker">${inCampaign ? 'Campanha · ' + content.campaigns[CAMPAIGN_ID]!.displayName : 'Missão avulsa'} — briefing de operação</div>
        <h2>${mission.displayName}${mission.isNight ? ' <span class="night-tag">noite</span>' : ''}</h2>
        <div class="campaign-status small" data-el="campaignStatus" hidden></div>
        <div class="briefing-grid">
          <div class="map-col">
            <canvas data-el="map" width="${world.width * PX}" height="${world.height * PX}"></canvas>
            <div class="map-legend small">
              <span><i style="background:#5aa9ff"></i>Alfa</span><span><i style="background:#ffad4d"></i>Bravo</span>
              <span><i class="dash"></i>Perímetro: ${MT.area}</span><span><i style="background:#7fbf6a"></i>Extração</span>
              <span><i style="background:#e0563e"></i>Entradas de infectados</span>
            </div>
          </div>
          <div class="info-col">
            <p class="briefing">${mission.briefing}</p>
            <h4>Objetivos</h4>
            <ol class="obj-list">${['enterPerimeter', 'collectMedicine', 'rescueCivilian', 'activateExtraction', 'holdExtraction'].map((id) => `<li>${T.objectives[id]}</li>`).join('')}</ol>
            <h4>Informações</h4>
            <ul class="intel">${MT.intel.map((i) => `<li>${i}</li>`).join('')}</ul>
            <p class="small">Tempo limite: ${Math.round(mission.timeLimitSeconds / 60)} min · Falha se ${MT.person} morrer ou se todos caírem.</p>
          </div>
        </div>
        <details class="roster-wrap" ${inCampaign ? 'open' : ''}><summary>Equipe (${mission.squads.reduce((n, s) => n + s.memberIds.length, 0)} sobreviventes)</summary>${roster}</details>
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
    // keep labels inside the canvas (long area names near the edge)
    const label = (text: string, x: number, y: number) => {
      const w = g.measureText(text).width;
      g.fillText(text, Math.max(2, Math.min(x, canvas.width - w - 2)), Math.max(11, y));
    };
    label(MT.area.toUpperCase(), o.perimeter.x0 * PX + 4, o.perimeter.y0 * PX - 4);
    label('EXTRAÇÃO', o.extraction.zone.x0 * PX + 2, o.extraction.zone.y0 * PX - 4);

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
      this.scene.start(inCampaign ? 'Strategic' : 'Menu');
    };
    if (inCampaign) {
      // campaign: the roster deploys as it came back from the last mission
      q('[data-act=seed]').hidden = true;
      q('[data-act=canon]').hidden = true;
      void CampaignStore.load().then((c) => {
        if (!c) return;
        campaign = c;
        const tries = c.history.filter((h) => h.missionId === missionId).length;
        seed = missionSeed(content, c, missionId);
        q('[data-el=seed]').textContent = String(seed);
        q('[data-el=seedNote]').textContent = tries ? `(tentativa ${tries + 1})` : '(canônica)';
        const alive = c.roster.filter((r) => r.alive).length;
        const status = q('[data-el=campaignStatus]');
        status.hidden = false;
        status.textContent = `${alive}/${c.roster.length} na equipe · ${c.stock.medicine} remédios · ${c.stock.ammo} balas no estoque · ${c.evacuated} evacuados`;
        for (const r of c.roster) {
          const cell = screen.querySelector<HTMLElement>(`[data-state="${r.templateId}"]`);
          if (!cell) continue;
          const t = content.survivors[r.templateId]!;
          if (!r.alive) {
            cell.textContent = 'morto';
            cell.className = 'state dead';
            cell.parentElement?.classList.add('fallen');
            continue;
          }
          const bits = [`vida ${r.health}/${t.maxHealth}`];
          if (r.infection !== 'healthy') bits.push(`infecção: ${STAGE[r.infection]}`);
          if (content.weapons[t.weaponId]!.magazineCapacity > 0) bits.push(`${r.ammo} balas`);
          cell.textContent = bits.join(' · ');
          cell.className = `state ${r.infection !== 'healthy' ? 'infected' : r.health < t.maxHealth * 0.6 ? 'hurt' : ''}`;
        }
      });
    }
    q('[data-act=deploy]').onclick = () => {
      audio.uiClick();
      this.scene.start('Tactical', {
        missionId,
        seed,
        campaign: inCampaign,
        carry: campaign ? carryOver(campaign) : undefined,
        reinforcements: campaign?.activeSectorId
          ? reinforcementMultiplier(campaign.sectors[campaign.activeSectorId]?.infestation ?? 50)
          : undefined,
      });
    };
  }

  override update(_time: number, delta: number): void {
    this.backdrop?.update(delta);
  }
}

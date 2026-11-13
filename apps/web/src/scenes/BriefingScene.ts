import Phaser from 'phaser';
import { loadContent } from '@dead-sector/content';
import { AudioEngine } from '../audio/AudioEngine';
import { Playtest } from '../telemetry/Playtest';
import { Backdrop } from '../render/Backdrop';
import { clearUi, uiRoot } from '../ui/dom';
import { CampaignStore } from '../ui/CampaignStore';
import {
  catalog,
  missionBriefing,
  missionTitle,
  MT,
  roleLabel,
  setMissionTexts,
  T,
  text,
  weaponLabel,
} from '../ui/i18n';
import { baseMap, drawMissionMarks } from '../ui/MapCanvas';
import { MISSION_ID } from './MenuScene';
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
    AudioEngine.get().setMusic('menu');
    const missionId = data.missionId ?? MISSION_ID;
    const inCampaign = !!data.campaign;
    const openedAt = Date.now();
    const readFor = () => Math.round((Date.now() - openedAt) / 1000);
    this.backdrop = new Backdrop(this, missionId);
    const content = loadContent();
    const mission = content.missions[missionId]!;
    setMissionTexts(mission.texts, missionId);
    const world = this.backdrop.world;
    let seed = mission.canonicalSeed;
    let campaign: CampaignState | null = null;
    clearUi();
    const stage = catalog().campaign.stage;

    const roster = mission.squads
      .map((sq) => {
        const rows = sq.memberIds
          .map((id) => {
            const t = content.survivors[id]!;
            const w = content.weapons[t.weaponId];
            return `<tr data-member="${id}"><td>${t.isLeader ? '★ ' : ''}${t.name}</td><td>${roleLabel(id, t.role)}</td><td>${weaponLabel(t.weaponId, w?.displayName ?? t.weaponId)}</td>
              <td>${pips(t.courage)}</td><td>${pips(t.marksmanship)}</td><td>${pips(t.stealth)}</td><td class="state" data-state="${id}">${text('briefing.ready')}</td></tr>`;
          })
          .join('');
        return `<h4 style="color:${SQUAD_CSS[sq.id]}">${text('briefing.squad', { name: sq.displayName })}</h4>
          <table class="roster"><tr><th>${text('briefing.name')}</th><th>${text('briefing.role')}</th><th>${text('briefing.weapon')}</th><th>${text('briefing.courage')}</th><th>${text('briefing.aim')}</th><th>${text('briefing.stealth')}</th><th>${text('briefing.state')}</th></tr>${rows}</table>`;
      })
      .join('');

    const screen = document.createElement('div');
    screen.className = 'screen briefing-screen';
    screen.innerHTML = `
      <div class="card panel briefing-card" data-testid="briefing">
        <div class="subtitle" data-el="kicker">${inCampaign ? text('briefing.campaignKicker', { name: catalog().campaign.displayName }) : text('briefing.singleKicker')}</div>
        <h2>${missionTitle(missionId, mission.displayName)}${mission.isNight ? ` <span class="night-tag">${text('briefing.night')}</span>` : ''}</h2>
        <div class="campaign-status small" data-el="campaignStatus" hidden></div>
        <div class="briefing-grid">
          <div class="map-col">
            <canvas data-el="map" width="${world.width * PX}" height="${world.height * PX}"></canvas>
            <div class="map-legend small">
              <span><i style="background:#5aa9ff"></i>Alfa</span><span><i style="background:#ffad4d"></i>Bravo</span>
              <span><i class="dash"></i>${text('briefing.perimeter', { area: MT.area })}</span><span><i style="background:#7fbf6a"></i>${text('briefing.extraction')}</span>
              <span><i style="background:#e0563e"></i>${text('briefing.entrances')}</span>
            </div>
          </div>
          <div class="info-col">
            <p class="briefing">${missionBriefing(missionId, mission.briefing)}</p>
            <h4>${text('briefing.objectives')}</h4>
            <ol class="obj-list">${['enterPerimeter', 'collectMedicine', 'rescueCivilian', 'activateExtraction', 'holdExtraction'].map((id) => `<li>${T.objectives[id]}</li>`).join('')}</ol>
            <h4>${text('briefing.intel')}</h4>
            <ul class="intel">${MT.intel.map((i) => `<li>${i}</li>`).join('')}</ul>
            <p class="small">${text('briefing.timeLimit', { minutes: Math.round(mission.timeLimitSeconds / 60), person: MT.person })}</p>
          </div>
        </div>
        <details class="roster-wrap" ${inCampaign ? 'open' : ''}><summary>${text('briefing.roster', { n: mission.squads.reduce((n, s) => n + s.memberIds.length, 0) })}</summary>${roster}</details>
        <div class="row briefing-actions">
          <span class="small">${text('briefing.seed')} <b data-el="seed">${seed}</b> <span data-el="seedNote">${text('briefing.canonical')}</span></span>
          <button data-act="seed" title="${text('briefing.newSeedTitle')}">${text('briefing.newSeed')}</button>
          <button data-act="canon">${text('briefing.canon')}</button>
          <span style="flex:1"></span>
          <button data-act="back" data-testid="btn-back">${text('briefing.back')}</button>
          <button data-act="deploy" class="primary" data-testid="btn-deploy">${text('briefing.deploy')}</button>
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
    label(
      text('briefing.extractionMark'),
      o.extraction.zone.x0 * PX + 2,
      o.extraction.zone.y0 * PX - 4,
    );

    const audio = AudioEngine.get();
    const setSeed = (s: number, canon: boolean) => {
      seed = s;
      q('[data-el=seed]').textContent = String(s);
      q('[data-el=seedNote]').textContent = canon
        ? text('briefing.canonical')
        : text('briefing.variation');
    };
    q('[data-act=seed]').onclick = () => setSeed(Math.floor(Math.random() * 1_000_000), false);
    q('[data-act=canon]').onclick = () => setSeed(mission.canonicalSeed, true);
    q('[data-act=back]').onclick = () => {
      audio.uiClick();
      Playtest.log('briefing', { missionId, choice: 'back', seconds: readFor() });
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
        q('[data-el=seedNote]').textContent = tries
          ? text('briefing.attempt', { n: tries + 1 })
          : text('briefing.canonical');
        const alive = c.roster.filter((r) => r.alive).length;
        const status = q('[data-el=campaignStatus]');
        status.hidden = false;
        status.textContent = text('briefing.stock', {
          alive,
          roster: c.roster.length,
          medicine: c.stock.medicine,
          ammo: c.stock.ammo,
          evacuated: c.evacuated,
        });
        for (const r of c.roster) {
          const cell = screen.querySelector<HTMLElement>(`[data-state="${r.templateId}"]`);
          if (!cell) continue;
          const t = content.survivors[r.templateId]!;
          if (!r.alive) {
            cell.textContent = text('briefing.dead');
            cell.className = 'state dead';
            cell.parentElement?.classList.add('fallen');
            continue;
          }
          const bits = [text('briefing.life', { hp: r.health, max: t.maxHealth })];
          if (r.infection !== 'healthy')
            bits.push(text('briefing.infection', { stage: stage[r.infection] }));
          if (content.weapons[t.weaponId]!.magazineCapacity > 0)
            bits.push(text('briefing.rounds', { n: r.ammo }));
          cell.textContent = bits.join(' · ');
          cell.className = `state ${r.infection !== 'healthy' ? 'infected' : r.health < t.maxHealth * 0.6 ? 'hurt' : ''}`;
        }
      });
    }
    q('[data-act=deploy]').onclick = () => {
      audio.uiClick();
      Playtest.log('briefing', { missionId, choice: 'deploy', seconds: readFor(), seed });
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

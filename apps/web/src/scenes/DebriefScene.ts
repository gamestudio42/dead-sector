import Phaser from 'phaser';
import { loadContent } from '@dead-sector/content';
import { applyOperationResult, buildDebrief, createWorld, type GameState } from '@dead-sector/sim';
import { CampaignStore } from '../ui/CampaignStore';
import { CAMPAIGN_ID } from './MenuScene';
import { gradeFor } from '../presentation/grade';
import { emptyRecord, type MissionRecord } from '../presentation/timeline';
import { clearUi, uiRoot } from '../ui/dom';
import { noticeIcon } from '../ui/fxIcon';
import {
  fmtTime,
  formatNotice,
  missionTitle,
  MT,
  roleLabel,
  setMissionTexts,
  T,
  text,
} from '../ui/i18n';
import { baseMap, drawMissionMarks, fogLayer } from '../ui/MapCanvas';

const PX = 3;
const SQUAD_CSS: Record<string, string> = { alfa: '#5aa9ff', bravo: '#ffad4d' };
const statusLabel = (id: string): string =>
  id === 'extracted'
    ? text('debrief.statusExtracted')
    : id === 'dead'
      ? text('debrief.statusDead')
      : text('debrief.statusLeft');
const STATUS_ICON: Record<string, string> = { extracted: '✓', alive: '…', dead: '✗' };

export class DebriefScene extends Phaser.Scene {
  constructor() {
    super('Debrief');
  }

  create(data: { state: GameState; record?: MissionRecord; campaign?: boolean }): void {
    clearUi();
    const state = data.state;
    const mission = loadContent().missions[state.missionId];
    if (mission) setMissionTexts(mission.texts, state.missionId);
    const rec = data.record ?? emptyRecord();
    const d = buildDebrief(state);
    const grade = gradeFor(d);
    const world = createWorld(loadContent(), state.missionId, state.doors);
    const tile = (label: string, value: string, sub = '') =>
      `<div class="stat-tile"><span class="lbl">${label}</span><b>${value}</b>${sub ? `<small>${sub}</small>` : ''}</div>`;

    const screen = document.createElement('div');
    screen.className = 'screen debrief-screen';
    screen.innerHTML = `
      <div class="card panel debrief-card" data-testid="debrief">
        <div class="debrief-head">
          <div>
            <div class="subtitle">${text('debrief.title', { mission: missionTitle(state.missionId, world.mission.displayName) })}</div>
            <h2 class="outcome ${d.outcome}" data-testid="debrief-outcome">${T.outcome[d.outcome]}</h2>
            <p class="briefing">${T.endReason[d.reason ?? ''] ?? ''}</p>
          </div>
          <div class="grade grade-${grade.letter}" data-testid="debrief-grade" title="${grade.notes.join(' · ')}">${grade.letter}</div>
        </div>
        <ul class="grade-notes">${grade.notes.map((n) => `<li>${n}</li>`).join('')}</ul>
        <div class="debrief-grid">
          <div>
            <canvas data-el="route" width="${world.width * PX}" height="${world.height * PX}"></canvas>
            <div class="small">${text('debrief.route')}</div>
          </div>
          <div class="debrief-side">
            <div class="stat-tiles">
              ${tile(text('debrief.duration'), fmtTime(d.durationSeconds))}
              ${tile(text('debrief.extracted'), `<span data-testid="debrief-extracted">${d.extracted}</span>`, text('debrief.dead', { n: d.dead }))}
              ${tile(text('debrief.kills'), String(d.zombiesKilled), text('debrief.hitRate', { rate: Math.round(d.hitRate * 100), shots: d.shotsFired }))}
              ${tile(text('debrief.noise'), String(d.totalNoise), text('debrief.reinforcements', { n: d.reinforcements }))}
              ${tile(text('debrief.supplies'), d.medicineRecovered ? MT.itemDone : text('debrief.none'))}
              ${tile(MT.personTag.charAt(0) + MT.personTag.slice(1).toLowerCase(), d.civilianExtracted ? text('debrief.safe') : text('debrief.notExtracted'))}
            </div>
            <h4>${text('debrief.timeline')}</h4>
            <ol class="timeline">${
              rec.timeline.length
                ? rec.timeline
                    .map(
                      (e) =>
                        `<li class="${e.tone}"><span class="t">${fmtTime(e.tick / 10)}</span>${e.text}</li>`,
                    )
                    .join('')
                : `<li class="info">${text('debrief.emptyTimeline')}</li>`
            }</ol>
          </div>
        </div>
        <table class="stats">
          <tr><th></th><th>${text('debrief.survivor')}</th><th>${text('debrief.role')}</th><th>${text('debrief.state')}</th><th>${text('debrief.health')}</th><th>${text('debrief.infection')}</th><th>${text('debrief.kills')}</th><th>${text('debrief.shots')}</th></tr>
          ${d.survivors
            .map((s) => {
              const who = state.survivors.find((x) => x.id === s.id);
              const role = who
                ? roleLabel(who.templateId, s.role, who.isObjectiveCivilian)
                : s.role;
              return `<tr class="st-${s.status}"><td style="color:${SQUAD_CSS[s.squadId ?? ''] ?? '#f0e6d6'}">${STATUS_ICON[s.status]}</td><td>${s.name}</td><td>${role}</td><td>${statusLabel(s.status)}</td><td>${s.health}</td><td>${T.infection[s.infection]}${s.bitten ? ` ${text('debrief.bitten')}` : ''}</td><td>${s.kills}</td><td>${s.shotsFired}</td></tr>`;
            })
            .join('')}
        </table>
        <section class="interlude" data-el="interlude" data-testid="interlude" hidden></section>
        <div class="row" data-el="actions">
          <button data-act="again" class="primary" data-testid="btn-again">${text('debrief.again')}</button>
          <button data-act="menu" data-testid="btn-menu">${text('debrief.menu')}</button>
        </div>
      </div>`;
    uiRoot().appendChild(screen);

    const canvas = screen.querySelector('[data-el=route]') as HTMLCanvasElement;
    const g = canvas.getContext('2d') as CanvasRenderingContext2D;
    g.drawImage(baseMap(world, PX), 0, 0);
    drawMissionMarks(g, world, PX, state.mission.medicineCollected);
    g.globalAlpha = 0.75;
    g.drawImage(fogLayer(state, world), 0, 0, canvas.width, canvas.height);
    g.globalAlpha = 1;
    g.lineJoin = 'round';
    for (const [id, pts] of Object.entries(rec.traces)) {
      const s = state.survivors.find((m) => m.id === id);
      if (!s || pts.length < 2) continue;
      g.strokeStyle = s.isObjectiveCivilian ? '#f0e6d6' : (SQUAD_CSS[s.squadId ?? ''] ?? '#fff');
      g.lineWidth = s.isLeader || s.isObjectiveCivilian ? 2 : 1;
      g.globalAlpha = s.isLeader || s.isObjectiveCivilian ? 0.95 : 0.4;
      g.beginPath();
      pts.forEach((p, i) => (i ? g.lineTo(p.x * PX, p.y * PX) : g.moveTo(p.x * PX, p.y * PX)));
      g.stroke();
    }
    g.globalAlpha = 1;
    g.strokeStyle = '#ff5a40';
    g.lineWidth = 2;
    for (const dth of rec.deaths) {
      const x = dth.x * PX;
      const y = dth.y * PX;
      g.beginPath();
      g.moveTo(x - 4, y - 4);
      g.lineTo(x + 4, y + 4);
      g.moveTo(x + 4, y - 4);
      g.lineTo(x - 4, y + 4);
      g.stroke();
    }

    (screen.querySelector('[data-act=again]') as HTMLButtonElement).onclick = () =>
      this.scene.start('Tactical', { missionId: state.missionId, seed: state.seed });
    if (data.campaign) void this.advanceCampaign(screen, state);
    (screen.querySelector('[data-act=menu]') as HTMLButtonElement).onclick = () =>
      this.scene.start('Menu');
  }

  /** Folds the mission into the saved campaign and shows what happened before the next one. */
  private async advanceCampaign(screen: HTMLElement, state: GameState): Promise<void> {
    const content = loadContent();
    const campaign = await CampaignStore.load();
    const def = content.campaigns[CAMPAIGN_ID];
    if (!campaign || !def || campaign.status !== 'active') return;
    // a mission is folded in exactly once, even if this screen is shown again
    const key = `${state.missionId}@${state.seed}#${state.tick}`;
    if (campaign.history.some((h) => h.key === key)) return;
    // a quicksave from before this operation was chosen still knows its mission
    const sectorId =
      campaign.activeSectorId ?? def.sectors.find((x) => x.missionId === state.missionId)?.id;
    if (!sectorId) return;
    const { campaign: next, report } = applyOperationResult(content, campaign, sectorId, state);
    const last = next.history[next.history.length - 1];
    if (last) last.key = key;
    await CampaignStore.save(next);
    const box = screen.querySelector('[data-el=interlude]') as HTMLElement;
    const head =
      next.status === 'won'
        ? text('debrief.won')
        : next.status === 'lost'
          ? text('debrief.lost')
          : state.mission.status === 'failed'
            ? text('debrief.failed')
            : text('debrief.shelter');
    const alive = next.roster.filter((r) => r.alive).length;
    box.hidden = false;
    box.innerHTML = `<h4>${head}</h4>
      <ul>${report.lines.map((l) => `<li>${noticeIcon(l.kind)}${formatNotice(l)}</li>`).join('') || `<li>${text('debrief.noNews')}</li>`}</ul>
      <p class="small">${text('debrief.stock', { alive, roster: next.roster.length, medicine: next.stock.medicine, ammo: next.stock.ammo, evacuated: next.evacuated })}</p>`;
    const actions = screen.querySelector('[data-el=actions]') as HTMLElement;
    const again = actions.querySelector('[data-act=again]') as HTMLButtonElement;
    again.remove();
    const go = document.createElement('button');
    go.className = 'primary';
    go.dataset['testid'] = 'btn-to-shelter';
    go.textContent = text('debrief.toShelter');
    go.onclick = () => this.scene.start('Strategic');
    actions.prepend(go);
  }
}

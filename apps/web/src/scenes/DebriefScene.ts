import Phaser from 'phaser';
import { loadContent } from '@dead-sector/content';
import { applyOperationResult, buildDebrief, createWorld, type GameState } from '@dead-sector/sim';
import { CampaignStore } from '../ui/CampaignStore';
import { CAMPAIGN_ID } from './MenuScene';
import { gradeFor } from '../presentation/grade';
import { emptyRecord, type MissionRecord } from '../presentation/timeline';
import { clearUi, uiRoot } from '../ui/dom';
import { fmtTime, MT, T } from '../ui/i18n';
import { baseMap, drawMissionMarks, fogLayer } from '../ui/MapCanvas';

const PX = 3;
const SQUAD_CSS: Record<string, string> = { alfa: '#5aa9ff', bravo: '#ffad4d' };
const STATUS: Record<string, string> = {
  extracted: 'retirado',
  alive: 'deixado para trás',
  dead: 'morto',
};
const STATUS_ICON: Record<string, string> = { extracted: '✓', alive: '…', dead: '✗' };

export class DebriefScene extends Phaser.Scene {
  constructor() {
    super('Debrief');
  }

  create(data: { state: GameState; record?: MissionRecord; campaign?: boolean }): void {
    clearUi();
    const state = data.state;
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
            <div class="subtitle">Debriefing — ${world.mission.displayName}</div>
            <h2 class="outcome ${d.outcome}" data-testid="debrief-outcome">${T.outcome[d.outcome]}</h2>
            <p class="briefing">${T.endReason[d.reason ?? ''] ?? ''}</p>
          </div>
          <div class="grade grade-${grade.letter}" data-testid="debrief-grade" title="${grade.notes.join(' · ')}">${grade.letter}</div>
        </div>
        <ul class="grade-notes">${grade.notes.map((n) => `<li>${n}</li>`).join('')}</ul>
        <div class="debrief-grid">
          <div>
            <canvas data-el="route" width="${world.width * PX}" height="${world.height * PX}"></canvas>
            <div class="small">Trajeto das equipes · ✗ baixas</div>
          </div>
          <div class="debrief-side">
            <div class="stat-tiles">
              ${tile('Duração', fmtTime(d.durationSeconds))}
              ${tile('Retirados', `<span data-testid="debrief-extracted">${d.extracted}</span>`, `${d.dead} mortos`)}
              ${tile('Abates', String(d.zombiesKilled), `${Math.round(d.hitRate * 100)}% de ${d.shotsFired} disparos`)}
              ${tile('Ruído total', String(d.totalNoise), `${d.reinforcements} reforços atraídos`)}
              ${tile('Suprimentos', d.medicineRecovered ? MT.itemDone : 'Nenhum')}
              ${tile(MT.personTag.charAt(0) + MT.personTag.slice(1).toLowerCase(), d.civilianExtracted ? 'A salvo' : 'Não retirada(o)')}
            </div>
            <h4>Linha do tempo</h4>
            <ol class="timeline">${
              rec.timeline.length
                ? rec.timeline
                    .map(
                      (e) =>
                        `<li class="${e.tone}"><span class="t">${fmtTime(e.tick / 10)}</span>${e.text}</li>`,
                    )
                    .join('')
                : '<li class="info">Sem registro (missão carregada de um salvamento)</li>'
            }</ol>
          </div>
        </div>
        <table class="stats">
          <tr><th></th><th>Sobrevivente</th><th>Função</th><th>Estado</th><th>Vida</th><th>Infecção</th><th>Abates</th><th>Disparos</th></tr>
          ${d.survivors
            .map(
              (s) =>
                `<tr class="st-${s.status}"><td style="color:${SQUAD_CSS[s.squadId ?? ''] ?? '#f0e6d6'}">${STATUS_ICON[s.status]}</td><td>${s.name}</td><td>${s.role}</td><td>${STATUS[s.status]}</td><td>${s.health}</td><td>${T.infection[s.infection]}${s.bitten ? ' (mordido)' : ''}</td><td>${s.kills}</td><td>${s.shotsFired}</td></tr>`,
            )
            .join('')}
        </table>
        <section class="interlude" data-el="interlude" data-testid="interlude" hidden></section>
        <div class="row" data-el="actions">
          <button data-act="again" class="primary" data-testid="btn-again">Jogar novamente</button>
          <button data-act="menu" data-testid="btn-menu">Menu principal</button>
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
        ? 'Evacuação concluída.'
        : next.status === 'lost'
          ? 'Campanha perdida.'
          : state.mission.status === 'failed'
            ? 'A operação falhou: o setor piorou e quem caiu não volta.'
            : 'De volta ao abrigo.';
    const alive = next.roster.filter((r) => r.alive).length;
    box.hidden = false;
    box.innerHTML = `<h4>${head}</h4>
      <ul>${report.lines.map((l) => `<li>${l}</li>`).join('') || '<li>Sem novidades.</li>'}</ul>
      <p class="small">${alive}/${next.roster.length} na equipe · ${next.stock.medicine} remédios · ${next.stock.ammo} balas · ${next.evacuated} evacuados</p>`;
    const actions = screen.querySelector('[data-el=actions]') as HTMLElement;
    const again = actions.querySelector('[data-act=again]') as HTMLButtonElement;
    again.remove();
    const go = document.createElement('button');
    go.className = 'primary';
    go.dataset['testid'] = 'btn-to-shelter';
    go.textContent = 'Voltar ao abrigo ▶';
    go.onclick = () => this.scene.start('Strategic');
    actions.prepend(go);
  }
}

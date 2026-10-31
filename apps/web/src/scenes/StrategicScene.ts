import Phaser from 'phaser';
import { loadContent } from '@dead-sector/content';
import {
  endDay,
  newCampaign,
  operationBlockReason,
  reinforcementMultiplier,
  sectorStatus,
  treatInfection,
  type CampaignState,
  type SectorStatus,
} from '@dead-sector/sim';
import { AudioEngine } from '../audio/AudioEngine';
import { Backdrop } from '../render/Backdrop';
import { CampaignStore } from '../ui/CampaignStore';
import { clearUi, uiRoot } from '../ui/dom';
import { CAMPAIGN_ID, MISSION_ID } from './MenuScene';

const STATUS: Record<SectorStatus, string> = {
  unknown: 'Desconhecido',
  infested: 'Infestado',
  contested: 'Disputado',
  secured: 'Assegurado',
  lost: 'Perdido',
};
const STAGE: Record<string, string> = {
  exposed: 'exposto',
  infected: 'infectado',
  critical: 'crítico',
};

/** Between operations: the shelter's stock and people, and the map of the sector. */
export class StrategicScene extends Phaser.Scene {
  private backdrop: Backdrop | null = null;
  private campaign!: CampaignState;
  private selected: string | null = null;
  private screen!: HTMLDivElement;

  constructor() {
    super('Strategic');
  }

  create(): void {
    this.backdrop = new Backdrop(this, MISSION_ID);
    this.selected = null;
    clearUi();
    this.screen = document.createElement('div');
    this.screen.className = 'screen strategic-screen';
    uiRoot().appendChild(this.screen);
    this.screen.addEventListener('click', (e) => this.onClick(e));
    void CampaignStore.load().then((c) => {
      if (c) return this.show(c);
      const fresh = newCampaign(loadContent(), CAMPAIGN_ID, Math.floor(Math.random() * 1_000_000));
      void CampaignStore.save(fresh).then(() => this.show(fresh));
    });
  }

  private show(c: CampaignState): void {
    this.campaign = c;
    this.render();
  }

  private async commit(c: CampaignState): Promise<void> {
    await CampaignStore.save(c);
    this.show(c);
  }

  private onClick(e: Event): void {
    const t = (e.target as HTMLElement).closest<HTMLElement>(
      '[data-sector],[data-act],[data-treat]',
    );
    if (!t) return;
    AudioEngine.get().uiClick();
    const content = loadContent();
    if (t.dataset['sector']) {
      this.selected = t.dataset['sector'];
      this.render();
      return;
    }
    if (t.dataset['treat']) {
      const next = treatInfection(content, this.campaign, t.dataset['treat']);
      if (next) void this.commit(next);
      return;
    }
    switch (t.dataset['act']) {
      case 'operate':
        if (this.selected) this.operate(this.selected);
        return;
      case 'endDay':
        void this.commit(endDay(content, this.campaign).campaign);
        return;
      case 'menu':
        this.scene.start('Menu');
        return;
      case 'restart': {
        this.selected = null;
        const seed = Math.floor(Math.random() * 1_000_000);
        void this.commit(newCampaign(content, CAMPAIGN_ID, seed));
        return;
      }
    }
  }

  private operate(sectorId: string): void {
    const content = loadContent();
    const missionId = content.campaigns[CAMPAIGN_ID]!.sectors.find(
      (s) => s.id === sectorId,
    )?.missionId;
    if (!missionId || operationBlockReason(content, this.campaign, sectorId)) return;
    const c = { ...this.campaign, activeSectorId: sectorId };
    void CampaignStore.save(c).then(() =>
      this.scene.start('Briefing', { missionId, campaign: true }),
    );
  }

  private render(): void {
    const content = loadContent();
    const def = content.campaigns[CAMPAIGN_ID]!;
    const c = this.campaign;
    const fighters = c.roster.filter((r) => r.alive).length;
    const foodNeed = Math.ceil((c.population + fighters) / def.peoplePerFood);
    const byId = new Map(def.sectors.map((s) => [s.id, s]));

    const edges = def.sectors
      .flatMap((s) =>
        s.neighbors
          .filter((n) => n > s.id)
          .map((n) => {
            const o = byId.get(n)!;
            const hidden =
              sectorStatus(def, c, s.id) === 'unknown' && sectorStatus(def, c, n) === 'unknown';
            return `<line x1="${s.pos.x}" y1="${s.pos.y}" x2="${o.pos.x}" y2="${o.pos.y}" class="${hidden ? 'faint' : ''}" />`;
          }),
      )
      .join('');
    const nodes = def.sectors
      .map((s) => {
        const status = sectorStatus(def, c, s.id);
        const shelter = s.id === def.shelterSectorId;
        return `<button class="sector ${status} ${shelter ? 'shelter' : ''} ${this.selected === s.id ? 'selected' : ''}"
          style="left:${s.pos.x}%;top:${s.pos.y}%" data-sector="${s.id}" data-testid="sector-${s.id}" data-status="${status}">
          <i></i><b>${status === 'unknown' ? '???' : s.displayName}</b>
          <small>${status === 'unknown' ? STATUS.unknown : shelter ? 'Abrigo' : `${STATUS[status]} · ${Math.round(c.sectors[s.id]!.infestation)}%`}</small>
        </button>`;
      })
      .join('');

    const chip = (label: string, value: string, title: string, warn = false) =>
      `<span class="stock-chip ${warn ? 'warn' : ''}" title="${title}"><small>${label}</small><b>${value}</b></span>`;

    const roster = c.roster
      .map((r) => {
        const t = content.survivors[r.templateId]!;
        const w = content.weapons[t.weaponId]!;
        if (!r.alive)
          return `<tr class="fallen"><td>${t.name}</td><td>${t.role}</td><td colspan="3" class="state dead">morto</td></tr>`;
        const infected = r.infection !== 'healthy';
        return `<tr><td>${t.isLeader ? '★ ' : ''}${t.name}</td><td>${t.role}</td>
          <td>${r.health}/${t.maxHealth}</td><td>${w.magazineCapacity > 0 ? r.ammo : '—'}</td>
          <td class="state ${infected ? 'infected' : ''}">${
            infected
              ? `${STAGE[r.infection]} <button data-treat="${r.templateId}" data-testid="treat-${r.templateId}" ${c.stock.medicine > 0 ? '' : 'disabled'} title="Gasta 1 remédio">Tratar</button>`
              : 'bem'
          }</td></tr>`;
      })
      .join('');

    this.screen.innerHTML = `
      <div class="card panel strategic-card" data-testid="strategic">
        <div class="strategic-head">
          <div>
            <div class="subtitle">Campanha · ${def.displayName}</div>
            <h2 data-testid="campaign-day">Dia ${Math.min(c.day, def.victory.deadlineDays)} de ${def.victory.deadlineDays}</h2>
          </div>
          <div class="stock-chips">
            ${chip('Evacuados', `<span data-testid="evacuated">${c.evacuated}</span>/${def.victory.evacuateGoal}`, 'Pessoas fora do setor. Chegue à meta antes do prazo.')}
            ${chip('Abrigo', `<span data-testid="population">${c.population}</span>`, 'Pessoas no abrigo que não lutam')}
            ${chip('Comida', `<span data-testid="stock-food">${c.stock.food}</span>`, `Consumo: ${foodNeed} por dia para ${c.population + fighters} pessoas`, c.stock.food < foodNeed * 2)}
            ${chip('Remédios', `<span data-testid="stock-medicine">${c.stock.medicine}</span>`, 'Cada um elimina a infecção de uma pessoa')}
            ${chip('Munição', `<span data-testid="stock-ammo">${c.stock.ammo}</span>`, 'As equipes se rearmam daqui ao fim de cada dia', c.stock.ammo < 20)}
            ${chip('Peças', `${c.stock.parts}`, 'Ainda sem uso: servirão para melhorar o abrigo')}
          </div>
        </div>
        <div class="row strategic-actions">
          <button data-act="menu" data-testid="btn-strategic-menu">Menu principal</button>
          <span style="flex:1"></span>
          ${
            c.status === 'active'
              ? `<span class="small">Ao fim do dia: −${foodNeed} de comida, infecções avançam, hordas se movem.</span>
                 <button data-act="endDay" class="${c.operatedToday ? 'primary' : ''}" data-testid="btn-end-day">Encerrar o dia</button>`
              : '<button data-act="restart" class="primary" data-testid="btn-new-campaign">Nova campanha</button>'
          }
        </div>
        ${c.status === 'active' ? '' : `<div class="campaign-end ${c.status}" data-testid="campaign-end"><h3>${c.status === 'won' ? 'Evacuação concluída' : 'Campanha perdida'}</h3><p>${c.endReason ?? ''}</p></div>`}
        <div class="strategic-grid">
          <div class="sector-map" data-testid="sector-map">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${edges}</svg>
            ${nodes}
          </div>
          <div class="sector-side">${this.sectorPanel()}</div>
        </div>
        <div class="strategic-grid lower">
          <table class="roster"><tr><th>Equipe</th><th>Função</th><th>Vida</th><th>Balas</th><th>Estado</th></tr>${roster}</table>
          <div class="interlude" data-testid="campaign-report">
            <h4>Último relatório</h4>
            <ul>${c.lastReport.map((l) => `<li>${l}</li>`).join('') || '<li>Nada a relatar ainda.</li>'}</ul>
          </div>
        </div>
      </div>`;
  }

  private sectorPanel(): string {
    const content = loadContent();
    const def = content.campaigns[CAMPAIGN_ID]!;
    const c = this.campaign;
    if (!this.selected)
      return `<p class="briefing">${def.intro}</p><p class="small">Escolha um setor no mapa. Meta: ${def.victory.evacuateGoal} pessoas fora do setor até o dia ${def.victory.deadlineDays}.</p>`;
    const sec = def.sectors.find((s) => s.id === this.selected)!;
    const state = c.sectors[sec.id]!;
    const status = sectorStatus(def, c, sec.id);
    if (status === 'unknown')
      return `<h3>Setor desconhecido</h3><p class="small">Assegure um setor vizinho para saber o que há aqui.</p>`;
    const block = operationBlockReason(content, c, sec.id);
    const pay = (v: number) => (state.looted ? Math.floor(v / 2) : v);
    const r = sec.reward;
    const reward = [
      pay(r.food) && `${pay(r.food)} comida`,
      pay(r.medicine) && `${pay(r.medicine)} remédios`,
      pay(r.ammo) && `${pay(r.ammo)} balas`,
      pay(r.parts) && `${pay(r.parts)} peças`,
      pay(r.people) && `${pay(r.people)} pessoa(s)`,
    ].filter(Boolean);
    const mission = sec.missionId ? content.missions[sec.missionId] : null;
    return `<h3 data-testid="sector-name">${sec.displayName}</h3>
      <div class="small sector-status ${status}">${STATUS[status]}</div>
      <p>${sec.blurb}</p>
      <div class="meter-row"><small>Infestação</small><span class="meter"><i style="width:${state.infestation}%"></i></span><b>${Math.round(state.infestation)}%</b></div>
      ${state.noise >= 2 ? `<p class="small warn-text">Barulho recente: atrai infectados dos vizinhos.</p>` : ''}
      ${
        mission
          ? `<h4>${mission.displayName}${mission.isNight ? ' <span class="night-tag">noite</span>' : ''}</h4>
             <ul class="intel">
               ${reward.length ? `<li>Recompensa${state.looted ? ' (já saqueado: metade)' : ''}: ${reward.join(', ')}</li>` : ''}
               ${sec.evacuates ? `<li>Evacua até ${sec.evacuates} pessoas do abrigo</li>` : ''}
               <li>Reforços inimigos: ×${reinforcementMultiplier(state.infestation).toFixed(1).replace('.', ',')}</li>
               <li>Custo: a operação do dia; balas gastas só voltam do estoque; mortes são permanentes</li>
             </ul>`
          : ''
      }
      ${
        block
          ? `<p class="small" data-testid="sector-block">${block}</p>`
          : `<button data-act="operate" class="primary" data-testid="btn-operate">Preparar operação ▶</button>`
      }`;
  }

  override update(_time: number, delta: number): void {
    this.backdrop?.update(delta);
  }
}

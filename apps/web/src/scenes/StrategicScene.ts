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
} from '@dead-sector/sim';
import { AudioEngine } from '../audio/AudioEngine';
import { Backdrop } from '../render/Backdrop';
import { CampaignStore } from '../ui/CampaignStore';
import { clearUi, uiRoot } from '../ui/dom';
import {
  catalog,
  formatBlock,
  formatEnd,
  formatNotice,
  missionTitle,
  roleLabel,
  sectorBlurb,
  text,
} from '../ui/i18n';
import { CAMPAIGN_ID, MISSION_ID } from './MenuScene';

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
          <small>${status === 'unknown' ? text('strategic.status.unknown') : shelter ? text('strategic.shelterTag') : `${text(`strategic.status.${status}`)} · ${Math.round(c.sectors[s.id]!.infestation)}%`}</small>
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
          return `<tr class="fallen"><td>${t.name}</td><td>${roleLabel(r.templateId, t.role)}</td><td colspan="3" class="state dead">${text('strategic.dead')}</td></tr>`;
        const infected = r.infection !== 'healthy';
        const stage = catalog().campaign.stage[r.infection];
        return `<tr><td>${t.isLeader ? '★ ' : ''}${t.name}</td><td>${roleLabel(r.templateId, t.role)}</td>
          <td>${r.health}/${t.maxHealth}</td><td>${w.magazineCapacity > 0 ? r.ammo : '—'}</td>
          <td class="state ${infected ? 'infected' : ''}">${
            infected
              ? `${stage} <button data-treat="${r.templateId}" data-testid="treat-${r.templateId}" ${c.stock.medicine > 0 ? '' : 'disabled'} title="${text('strategic.treatTip')}">${text('strategic.treat')}</button>`
              : text('strategic.fine')
          }</td></tr>`;
      })
      .join('');

    this.screen.innerHTML = `
      <div class="card panel strategic-card" data-testid="strategic">
        <div class="strategic-head">
          <div>
            <div class="subtitle">${text('strategic.kicker', { name: catalog().campaign.displayName })}</div>
            <h2 data-testid="campaign-day">${text('strategic.day', { day: Math.min(c.day, def.victory.deadlineDays), total: def.victory.deadlineDays })}</h2>
          </div>
          <div class="stock-chips">
            ${chip(text('strategic.evacuated'), `<span data-testid="evacuated">${c.evacuated}</span>/${def.victory.evacuateGoal}`, text('strategic.evacuatedTip'))}
            ${chip(text('strategic.shelter'), `<span data-testid="population">${c.population}</span>`, text('strategic.shelterTip'))}
            ${chip(text('strategic.food'), `<span data-testid="stock-food">${c.stock.food}</span>`, text('strategic.foodTip', { need: foodNeed, people: c.population + fighters }), c.stock.food < foodNeed * 2)}
            ${chip(text('strategic.medicine'), `<span data-testid="stock-medicine">${c.stock.medicine}</span>`, text('strategic.medicineTip'))}
            ${chip(text('strategic.ammo'), `<span data-testid="stock-ammo">${c.stock.ammo}</span>`, text('strategic.ammoTip'), c.stock.ammo < 20)}
            ${chip(text('strategic.parts'), `${c.stock.parts}`, text('strategic.partsTip'))}
          </div>
        </div>
        <div class="row strategic-actions">
          <button data-act="menu" data-testid="btn-strategic-menu">${text('strategic.menu')}</button>
          <span style="flex:1"></span>
          ${
            c.status === 'active'
              ? `<span class="small">${text('strategic.nightNote', { need: foodNeed })}</span>
                 <button data-act="endDay" class="${c.operatedToday ? 'primary' : ''}" data-testid="btn-end-day">${text('strategic.endDay')}</button>`
              : `<button data-act="restart" class="primary" data-testid="btn-new-campaign">${text('strategic.newCampaign')}</button>`
          }
        </div>
        ${c.status === 'active' ? '' : `<div class="campaign-end ${c.status}" data-testid="campaign-end"><h3>${c.status === 'won' ? text('strategic.won') : text('strategic.lost')}</h3><p>${formatEnd(c.endReason)}</p></div>`}
        <div class="strategic-grid">
          <div class="sector-map" data-testid="sector-map">
            <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${edges}</svg>
            ${nodes}
          </div>
          <div class="sector-side">${this.sectorPanel()}</div>
        </div>
        <div class="strategic-grid lower">
          <table class="roster"><tr><th>${text('strategic.team')}</th><th>${text('strategic.role')}</th><th>${text('strategic.health')}</th><th>${text('strategic.rounds')}</th><th>${text('strategic.state')}</th></tr>${roster}</table>
          <div class="interlude" data-testid="campaign-report">
            <h4>${text('strategic.report')}</h4>
            <ul>${c.lastReport.map((l) => `<li>${formatNotice(l)}</li>`).join('') || `<li>${text('strategic.nothing')}</li>`}</ul>
          </div>
        </div>
      </div>`;
  }

  private sectorPanel(): string {
    const content = loadContent();
    const def = content.campaigns[CAMPAIGN_ID]!;
    const c = this.campaign;
    if (!this.selected)
      return `<p class="briefing">${catalog().campaign.intro}</p><p class="small">${text('strategic.goal', { goal: def.victory.evacuateGoal, day: def.victory.deadlineDays })}</p>`;
    const sec = def.sectors.find((s) => s.id === this.selected)!;
    const state = c.sectors[sec.id]!;
    const status = sectorStatus(def, c, sec.id);
    if (status === 'unknown')
      return `<h3>${text('strategic.unknownTitle')}</h3><p class="small">${text('strategic.unknownBody')}</p>`;
    const block = operationBlockReason(content, c, sec.id);
    const pay = (v: number) => (state.looted ? Math.floor(v / 2) : v);
    const r = sec.reward;
    const reward = [
      pay(r.food) && text('strategic.foodBit', { n: pay(r.food) }),
      pay(r.medicine) && text('strategic.medicineBit', { n: pay(r.medicine) }),
      pay(r.ammo) && text('strategic.ammoBit', { n: pay(r.ammo) }),
      pay(r.parts) && text('strategic.partsBit', { n: pay(r.parts) }),
      pay(r.people) && text('strategic.peopleBit', { n: pay(r.people) }),
    ].filter(Boolean);
    const mission = sec.missionId ? content.missions[sec.missionId] : null;
    return `<h3 data-testid="sector-name">${sec.displayName}</h3>
      <div class="small sector-status ${status}">${text(`strategic.status.${status}`)}</div>
      <p>${sectorBlurb(sec.id, sec.blurb)}</p>
      <div class="meter-row"><small>${text('strategic.infestation')}</small><span class="meter"><i style="width:${state.infestation}%"></i></span><b>${Math.round(state.infestation)}%</b></div>
      ${state.noise >= 2 ? `<p class="small warn-text">${text('strategic.noiseWarn')}</p>` : ''}
      ${
        mission
          ? `<h4>${missionTitle(mission.id, mission.displayName)}${mission.isNight ? ` <span class="night-tag">${text('menu.night')}</span>` : ''}</h4>
             <ul class="intel">
               ${reward.length ? `<li>${text('strategic.reward', { looted: state.looted ? text('strategic.looted') : '', bits: reward.join(', ') })}</li>` : ''}
               ${sec.evacuates ? `<li>${text('strategic.evac', { n: sec.evacuates })}</li>` : ''}
               <li>${text('strategic.reinforcements', { n: reinforcementMultiplier(state.infestation).toFixed(1).replace('.', ',') })}</li>
               <li>${text('strategic.cost')}</li>
             </ul>`
          : ''
      }
      ${
        block
          ? `<p class="small" data-testid="sector-block">${formatBlock(block)}</p>`
          : `<button data-act="operate" class="primary" data-testid="btn-operate">${text('strategic.operate')}</button>`
      }`;
  }

  override update(_time: number, delta: number): void {
    this.backdrop?.update(delta);
  }
}

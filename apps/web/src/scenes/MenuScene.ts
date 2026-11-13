import Phaser from 'phaser';
import { loadContent } from '@dead-sector/content';
import { newCampaign } from '@dead-sector/sim';
import { AudioEngine } from '../audio/AudioEngine';
import { Playtest } from '../telemetry/Playtest';
import { Backdrop } from '../render/Backdrop';
import { CampaignStore } from '../ui/CampaignStore';
import { desktop } from '../ui/desktop';
import { clearUi, uiRoot } from '../ui/dom';
import { openOptions } from '../ui/OptionsPanel';
import { catalog, missionTitle, text } from '../ui/i18n';
import { applyContrast, SaveStore } from '../ui/SaveStore';

export const MISSION_ID = 'a-ultima-farmacia';
export const CAMPAIGN_ID = 'ferrugem';
export const QUICKSAVE = 'quicksave';

const LIBRARIES: [string, string, string][] = [
  ['Phaser', 'credits.lib.phaser', 'MIT'],
  ['Zod', 'credits.lib.zod', 'MIT'],
  ['Vite', 'credits.lib.vite', 'MIT'],
  ['TypeScript', 'credits.lib.typescript', 'Apache-2.0'],
  ['Vitest', 'credits.lib.vitest', 'MIT'],
  ['Playwright', 'credits.lib.playwright', 'Apache-2.0'],
  ['ESLint · Prettier', 'credits.lib.eslint', 'MIT'],
];

function showCredits(): void {
  const m = document.createElement('div');
  m.className = 'overlay-menu';
  m.dataset['testid'] = 'credits';
  m.innerHTML = `<div class="card panel credits-card">
    <div class="options-head"><h3>${text('credits.title')}</h3><button data-act="close" aria-label="${text('credits.close')}">✕</button></div>
    <p>${text('credits.original')}</p>
    <p class="small">${text('credits.inspired')}</p>
    <h4>${text('credits.libraries')}</h4>
    <table class="stats">${LIBRARIES.map(([n, r, l]) => `<tr><td>${n}</td><td>${text(r)}</td><td>${l}</td></tr>`).join('')}</table>
    <h4>${text('credits.licenseTitle')}</h4>
    <p class="small">${text('credits.license')}
    <a href="https://github.com/gamestudio42/dead-sector" target="_blank" rel="noopener" data-testid="source-link">github.com/gamestudio42/dead-sector</a>.</p>
    <p class="small">${text('credits.version', { version: __BUILD_ID__ })}</p>
  </div>`;
  m.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t === m || t.closest('[data-act=close]')) m.remove();
  });
  uiRoot().appendChild(m);
}

/** Title screen over a live, decorative view of the first map. */
export class MenuScene extends Phaser.Scene {
  private backdrop: Backdrop | null = null;

  constructor() {
    super('Menu');
  }

  create(): void {
    applyContrast();
    this.backdrop = new Backdrop(this, MISSION_ID);
    const content = loadContent();
    const campaign = content.campaigns[CAMPAIGN_ID]!;
    const campName = catalog().campaign.displayName;
    clearUi();
    const screen = document.createElement('div');
    screen.className = 'screen title-screen';
    screen.innerHTML = `
      <div class="title-block" data-testid="menu">
        <h1 class="title">DEAD <span>SECTOR</span></h1>
        <div class="subtitle">${text('menu.subtitle')}</div>
        <nav class="menu-buttons">
          <button data-act="campaign" data-testid="btn-campaign"><b data-el="campaignLabel">${text('menu.campaign', { name: campName })}</b><small data-el="campaignSub">${text('menu.campaignSub', { days: campaign.victory.deadlineDays })}</small></button>
          <button data-act="new" data-testid="btn-new-mission"><b>${text('menu.single')}</b><small>${text('menu.singleSub')}</small></button>
          <div class="mission-pick" data-el="pick" hidden>
            ${Object.values(content.missions)
              .map(
                (m) =>
                  `<button data-mission="${m.id}" data-testid="pick-${m.id}"><b>${missionTitle(m.id, m.displayName)}</b><small>${content.maps[m.mapId]!.displayName}${m.isNight ? ` · ${text('menu.night')}` : ''}</small></button>`,
              )
              .join('')}
          </div>
          <button data-act="continue" data-testid="btn-continue" disabled><b>${text('menu.continue')}</b><small>${text('menu.continueSub')}</small></button>
          <button data-act="options" data-testid="btn-menu-options"><b>${text('menu.options')}</b><small>${text('menu.optionsSub')}</small></button>
          <button data-act="credits" data-testid="btn-credits"><b>${text('menu.credits')}</b><small>${text('menu.creditsSub')}</small></button>
          ${desktop ? `<button data-act="quit" data-testid="btn-quit"><b>${text('menu.quit')}</b><small>${text('menu.quitSub')}</small></button>` : ''}
        </nav>
        <p class="tagline">${text('menu.tagline')}</p>
      </div>
      <div class="build-note small">Dead Sector ${__BUILD_ID__} · AGPL-3.0 · <a href="https://github.com/gamestudio42/dead-sector" target="_blank" rel="noopener">${text('menu.source')}</a></div>`;
    uiRoot().appendChild(screen);
    const q = <T extends HTMLElement>(sel: string) => screen.querySelector(sel) as T;
    const audio = AudioEngine.get();

    let saved: Awaited<ReturnType<typeof CampaignStore.load>> = null;
    void CampaignStore.load().then((c) => {
      if (!c || c.status !== 'active') return;
      saved = c;
      const alive = c.roster.filter((r) => r.alive).length;
      q('[data-el=campaignLabel]').textContent = text('menu.continueCampaign', {
        day: c.day,
        days: campaign.victory.deadlineDays,
      });
      q('[data-el=campaignSub]').textContent = text('menu.continueCampaignSub', {
        alive,
        roster: c.roster.length,
        evacuated: c.evacuated,
        goal: campaign.victory.evacuateGoal,
      });
      const restart = document.createElement('button');
      restart.dataset['act'] = 'newCampaign';
      restart.innerHTML = `<b>${text('menu.newCampaign')}</b><small>${text('menu.newCampaignSub')}</small>`;
      q('[data-act=campaign]').after(restart);
    });

    screen.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-mission]');
      if (!t) return;
      audio.uiClick();
      Playtest.log('menu', { choice: t.dataset['mission'] ?? t.dataset['act'] ?? '' });
      if (t.dataset['mission'])
        return this.scene.start('Briefing', { missionId: t.dataset['mission'], campaign: false });
      switch (t.dataset['act']) {
        case 'campaign': {
          const c = saved ?? newCampaign(content, CAMPAIGN_ID, Math.floor(Math.random() * 1e6));
          void CampaignStore.save(c).then(() => this.scene.start('Strategic'));
          return;
        }
        case 'newCampaign': {
          const c = newCampaign(content, CAMPAIGN_ID, Math.floor(Math.random() * 1e6));
          void CampaignStore.save(c).then(() => this.scene.start('Strategic'));
          return;
        }
        case 'new':
          q('[data-el=pick]').hidden = !q('[data-el=pick]').hidden;
          return;
        case 'credits':
          showCredits();
          return;
        case 'quit':
          desktop?.quit();
          return;
        case 'options':
          screen.style.visibility = 'hidden';
          openOptions(() => this.scene.restart());
          return;
      }
    });
    const cont = q<HTMLButtonElement>('[data-act=continue]');
    void Promise.all([SaveStore.load(QUICKSAVE), CampaignStore.quicksaveIsCampaign()]).then(
      ([data, isCampaign]) => {
        if (!data) return;
        cont.disabled = false;
        cont.onclick = () => {
          Playtest.log('menu', { choice: 'continue' });
          this.scene.start('Tactical', { save: data, campaign: isCampaign });
        };
      },
    );
  }

  override update(_time: number, delta: number): void {
    this.backdrop?.update(delta);
  }
}

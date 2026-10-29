import Phaser from 'phaser';
import { loadContent } from '@dead-sector/content';
import { currentMissionId, newCampaign } from '@dead-sector/sim';
import { AudioEngine } from '../audio/AudioEngine';
import { Backdrop } from '../render/Backdrop';
import { CampaignStore } from '../ui/CampaignStore';
import { clearUi, uiRoot } from '../ui/dom';
import { openOptions } from '../ui/OptionsPanel';
import { applyContrast, SaveStore } from '../ui/SaveStore';

export const MISSION_ID = 'a-ultima-farmacia';
export const CAMPAIGN_ID = 'ferrugem';
export const QUICKSAVE = 'quicksave';

const LIBRARIES: [string, string, string][] = [
  ['Phaser', 'motor de renderização 2D', 'MIT'],
  ['Zod', 'validação do conteúdo', 'MIT'],
  ['Vite', 'build e servidor de desenvolvimento', 'MIT'],
  ['TypeScript', 'linguagem', 'Apache-2.0'],
  ['Vitest', 'testes', 'MIT'],
  ['Playwright', 'testes no navegador', 'Apache-2.0'],
  ['ESLint · Prettier', 'qualidade de código', 'MIT'],
];

function showCredits(): void {
  const m = document.createElement('div');
  m.className = 'overlay-menu';
  m.dataset['testid'] = 'credits';
  m.innerHTML = `<div class="card panel credits-card">
    <div class="options-head"><h3>Créditos</h3><button data-act="close" aria-label="Fechar">✕</button></div>
    <p>Dead Sector é um projeto original: código, mapas, missões, regras, textos, arte e sons foram criados para ele.
    Toda a arte é desenhada em código e todo o som é sintetizado em tempo real — nenhum arquivo de terceiros.</p>
    <p class="small">Inspirado na <i>mecânica</i> de jogos clássicos de tática de esquadrões; nenhum mapa, interface,
    fonte, logo ou código de outros jogos foi usado.</p>
    <h4>Bibliotecas</h4>
    <table class="stats">${LIBRARIES.map(([n, r, l]) => `<tr><td>${n}</td><td>${r}</td><td>${l}</td></tr>`).join('')}</table>
    <p class="small">Versão ${__BUILD_ID__}</p>
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
    clearUi();
    const screen = document.createElement('div');
    screen.className = 'screen title-screen';
    screen.innerHTML = `
      <div class="title-block" data-testid="menu">
        <h1 class="title">DEAD <span>SECTOR</span></h1>
        <div class="subtitle">Tática em tempo real pausável</div>
        <nav class="menu-buttons">
          <button data-act="campaign" data-testid="btn-campaign"><b data-el="campaignLabel">Campanha: ${campaign.displayName}</b><small data-el="campaignSub">${campaign.missions.length} missões encadeadas · perdas permanentes</small></button>
          <button data-act="new" data-testid="btn-new-mission"><b>Missão avulsa</b><small>Jogar uma missão sem consequências</small></button>
          <div class="mission-pick" data-el="pick" hidden>
            ${campaign.missions
              .map(
                (m) =>
                  `<button data-mission="${m.missionId}" data-testid="pick-${m.missionId}"><b>${m.title}</b><small>${content.maps[content.missions[m.missionId]!.mapId]!.displayName}${content.missions[m.missionId]!.isNight ? ' · noite' : ''}</small></button>`,
              )
              .join('')}
          </div>
          <button data-act="continue" data-testid="btn-continue" disabled><b>Continuar</b><small>Salvamento rápido</small></button>
          <button data-act="options" data-testid="btn-menu-options"><b>Opções</b><small>Áudio, vídeo, acessibilidade e controles</small></button>
          <button data-act="credits" data-testid="btn-credits"><b>Créditos</b><small>Autoria e bibliotecas</small></button>
        </nav>
        <p class="tagline">Cada disparo é ouvido. Cada decisão cobra seu preço.</p>
      </div>
      <div class="build-note small">Dead Sector ${__BUILD_ID__} · arte e som originais gerados em código</div>`;
    uiRoot().appendChild(screen);
    const q = <T extends HTMLElement>(sel: string) => screen.querySelector(sel) as T;
    const audio = AudioEngine.get();

    let saved: Awaited<ReturnType<typeof CampaignStore.load>> = null;
    void CampaignStore.load().then((c) => {
      if (!c || c.status !== 'active') return;
      saved = c;
      const step = campaign.missions[c.missionIndex];
      const alive = c.roster.filter((r) => r.alive).length;
      q('[data-el=campaignLabel]').textContent = `Continuar campanha: ${step?.title ?? ''}`;
      q('[data-el=campaignSub]').textContent =
        `${alive}/${c.roster.length} sobreviventes · ${c.supplies} doses de tratamento · nova campanha nas opções abaixo`;
      const restart = document.createElement('button');
      restart.dataset['act'] = 'newCampaign';
      restart.innerHTML = '<b>Nova campanha</b><small>Descarta a campanha em andamento</small>';
      q('[data-act=campaign]').after(restart);
    });

    screen.addEventListener('click', (e) => {
      const t = (e.target as HTMLElement).closest<HTMLElement>('[data-act],[data-mission]');
      if (!t) return;
      audio.uiClick();
      if (t.dataset['mission'])
        return this.scene.start('Briefing', { missionId: t.dataset['mission'], campaign: false });
      switch (t.dataset['act']) {
        case 'campaign': {
          const c = saved ?? newCampaign(content, CAMPAIGN_ID);
          void CampaignStore.save(c).then(() =>
            this.scene.start('Briefing', {
              missionId: currentMissionId(content, c),
              campaign: true,
            }),
          );
          return;
        }
        case 'newCampaign': {
          const c = newCampaign(content, CAMPAIGN_ID);
          void CampaignStore.save(c).then(() =>
            this.scene.start('Briefing', {
              missionId: currentMissionId(content, c),
              campaign: true,
            }),
          );
          return;
        }
        case 'new':
          q('[data-el=pick]').hidden = !q('[data-el=pick]').hidden;
          return;
        case 'credits':
          showCredits();
          return;
        case 'options':
          screen.style.visibility = 'hidden';
          openOptions(() => (screen.style.visibility = ''));
          return;
      }
    });
    const cont = q<HTMLButtonElement>('[data-act=continue]');
    void Promise.all([SaveStore.load(QUICKSAVE), CampaignStore.quicksaveIsCampaign()]).then(
      ([data, isCampaign]) => {
        if (!data) return;
        cont.disabled = false;
        cont.onclick = () => this.scene.start('Tactical', { save: data, campaign: isCampaign });
      },
    );
  }

  override update(_time: number, delta: number): void {
    this.backdrop?.update(delta);
  }
}

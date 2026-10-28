import Phaser from 'phaser';
import { buildDebrief, type GameState } from '@dead-sector/sim';
import { clearUi, uiRoot } from '../ui/dom';
import { fmtTime, T } from '../ui/i18n';

export class DebriefScene extends Phaser.Scene {
  constructor() {
    super('Debrief');
  }

  create(data: { state: GameState }): void {
    clearUi();
    const d = buildDebrief(data.state);
    const status: Record<string, string> = {
      extracted: 'retirado',
      alive: 'deixado para trás',
      dead: 'morto',
    };
    const screen = document.createElement('div');
    screen.className = 'screen';
    screen.innerHTML = `
      <div class="card panel" data-testid="debrief">
        <div class="subtitle">Debriefing — A Última Farmácia</div>
        <h2 class="outcome ${d.outcome}" data-testid="debrief-outcome">${T.outcome[d.outcome]}</h2>
        <p class="briefing">${T.endReason[d.reason ?? ''] ?? ''}</p>
        <table class="stats">
          <tr><th>Duração</th><td>${fmtTime(d.durationSeconds)}</td><th>Resultado</th><td>${T.outcome[d.outcome]}</td></tr>
          <tr><th>Retirados</th><td data-testid="debrief-extracted">${d.extracted}</td><th>Mortos</th><td>${d.dead}</td></tr>
          <tr><th>Feridos/mordidos</th><td>${d.wounded}</td><th>Munição usada</th><td>${d.ammoUsed}</td></tr>
          <tr><th>Ruído total</th><td>${d.totalNoise}</td><th>Suprimentos</th><td>${d.medicineRecovered ? 'Medicamentos recuperados' : 'Nenhum'}</td></tr>
          <tr><th>Civil</th><td>${d.civilianExtracted ? 'Retirada com vida' : 'Não retirada'}</td><th>Infectados abatidos</th><td>${d.zombiesKilled}</td></tr>
          <tr><th>Precisão</th><td>${Math.round(d.hitRate * 100)}% de ${d.shotsFired} disparos</td><th>Pânicos · reforços</th><td>${d.panicEvents} · ${d.reinforcements}</td></tr>
        </table>
        <table class="stats">
          <tr><th>Sobrevivente</th><th>Função</th><th>Estado</th><th>Vida</th><th>Infecção</th><th>Abates</th></tr>
          ${d.survivors.map((s) => `<tr><td>${s.name}</td><td>${s.role}</td><td>${status[s.status]}</td><td>${s.health}</td><td>${T.infection[s.infection]}${s.bitten ? ' (mordido)' : ''}</td><td>${s.kills}</td></tr>`).join('')}
        </table>
        <div class="row">
          <button data-act="again" data-testid="btn-again">Jogar novamente</button>
          <button data-act="menu" data-testid="btn-menu">Menu principal</button>
        </div>
      </div>`;
    uiRoot().appendChild(screen);
    (screen.querySelector('[data-act=again]') as HTMLButtonElement).onclick = () =>
      this.scene.start('Tactical', { seed: data.state.seed });
    (screen.querySelector('[data-act=menu]') as HTMLButtonElement).onclick = () =>
      this.scene.start('Menu');
  }
}

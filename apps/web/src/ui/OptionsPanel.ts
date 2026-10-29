import { AudioEngine } from '../audio/AudioEngine';
import { ACTION_LABELS, KeyBindings, keyLabel, type Action } from '../input/KeyBindings';
import { uiRoot } from './dom';
import { Settings, type LightingMode } from './SaveStore';

/** Mouse controls are fixed; keyboard shortcuts are rebindable below them. */
const MOUSE: [string, string][] = [
  ['Clique esq.', 'Selecionar esquadrão (Shift: adicionar/remover)'],
  ['Arrastar esq.', 'Caixa de seleção: todos os esquadrões dentro (Shift: somar)'],
  [
    'Clique dir.',
    'Mover no modo atual · sobre infectado: atacar · sobre porta, armário, civil ou rádio: interagir',
  ],
  ['Shift + dir.', 'Adicionar ponto à fila (executa quando a ordem atual termina)'],
  ['Ctrl + dir.', 'Menu de ordens no local (mover, furtivo, correr, ir e manter, ir e esconder…)'],
  ['Minimapa', 'Clique: mover câmera · botão direito: mover os esquadrões selecionados'],
  ['Roda · botão do meio', 'Zoom · arrastar a câmera'],
  ['Esc', 'Menu de pausa (fixo)'],
];

const ACTION_ORDER: Action[] = [
  'squad1',
  'squad2',
  'squad3',
  'squad4',
  'modeMove',
  'modeSneak',
  'modeSprint',
  'hold',
  'hide',
  'retreat',
  'regroup',
  'firePolicy',
  'pause',
  'speed',
  'quicksave',
  'quickload',
  'mute',
  'panUp',
  'panDown',
  'panLeft',
  'panRight',
  'debug',
];

const bindingRows = () =>
  ACTION_ORDER.map(
    (a) =>
      `<div class="bind-row"><span>${ACTION_LABELS[a]}</span><button class="bind" data-bind="${a}" data-testid="bind-${a}" title="Clique e pressione a nova tecla">${keyLabel(KeyBindings.get(a))}</button></div>`,
  ).join('');

const TABS = [
  ['audio', 'Áudio'],
  ['video', 'Vídeo'],
  ['access', 'Acessibilidade'],
  ['controls', 'Controles'],
] as const;

const range = (key: string, label: string, value: number) =>
  `<label class="opt"><span>${label}</span><input type="range" min="0" max="100" step="5" data-opt="${key}" value="${Math.round(value * 100)}" /><output>${Math.round(value * 100)}%</output></label>`;
const check = (key: string, label: string, value: boolean, hint = '') =>
  `<label class="opt"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span><input type="checkbox" data-opt="${key}" ${value ? 'checked' : ''} /></label>`;

/** Modal options screen (shared by the main menu and the in-mission pause flow). */
export function openOptions(onClose: () => void): HTMLDivElement {
  const audio = AudioEngine.get();
  const m = document.createElement('div');
  m.className = 'overlay-menu options';
  m.dataset['testid'] = 'options';
  m.innerHTML = `<div class="card panel options-card" role="dialog" aria-label="Opções">
    <div class="options-head"><h3>Opções</h3><button data-act="close" data-testid="btn-options-close" aria-label="Fechar">✕</button></div>
    <div class="tabs">${TABS.map(([id, label], i) => `<button data-tab="${id}" class="${i === 0 ? 'active' : ''}">${label}</button>`).join('')}</div>
    <section data-pane="audio">
      ${range('volume', 'Volume geral', Settings.volume)}
      ${range('sfxVolume', 'Efeitos', Settings.sfxVolume)}
      ${range('ambienceVolume', 'Ambiente e tensão', Settings.ambienceVolume)}
      ${check('muted', 'Sem som', Settings.muted, 'Tecla M durante a missão')}
    </section>
    <section data-pane="video" hidden>
      <label class="opt"><span>Iluminação<small>Vale a partir da próxima missão</small></span>
        <select data-opt="lighting"><option value="dusk">Crepúsculo</option><option value="day">Dia</option></select></label>
      ${check('blood', 'Sangue', Settings.blood)}
      <label class="opt"><span>Escala da interface</span>
        <select data-opt="hudScale"><option value="1">100%</option><option value="1.25">125%</option><option value="1.5">150%</option></select></label>
    </section>
    <section data-pane="access" hidden>
      ${check('captions', 'Legendas de sons', Settings.captions, 'Mostra tiros, rosnados e portas com direção e distância')}
      ${check('contrast', 'Alto contraste', Settings.contrast, 'Painéis opacos, texto maior e barras com contorno')}
      ${check('shake', 'Tremor de câmera e flashes', Settings.shake, 'Desligue para reduzir movimento na tela')}
      <p class="small">Cores sempre vêm acompanhadas de ícones ou texto. Pausa e velocidade nunca penalizam o jogador.</p>
    </section>
    <section data-pane="controls" hidden>
      <div class="controls-grid">${MOUSE.map(([k, v]) => `<span class="kbd">${k}</span><span>${v}</span>`).join('')}</div>
      <h4 class="bind-head">Teclado <button data-act="resetKeys" class="small-btn">Restaurar padrão</button></h4>
      <div class="bindings" data-el="bindings">${bindingRows()}</div>
      <p class="small" data-el="bindNote">Clique numa tecla e pressione a nova. Se ela já estiver em uso, as duas ações trocam de tecla.</p>
    </section>
  </div>`;
  const q = <T extends HTMLElement>(sel: string) => m.querySelector(sel) as T;
  q<HTMLSelectElement>('[data-opt=lighting]').value = Settings.lighting;
  q<HTMLSelectElement>('[data-opt=hudScale]').value = String(Settings.hudScale);

  const close = () => {
    m.remove();
    window.removeEventListener('keydown', onKey, true);
    onClose();
  };
  let capturing: Action | null = null;
  const refreshBindings = () => {
    q('[data-el=bindings]').innerHTML = bindingRows();
  };
  const onKey = (e: KeyboardEvent) => {
    if (capturing) {
      e.stopImmediatePropagation();
      e.preventDefault();
      const action = capturing;
      capturing = null;
      const note = q('[data-el=bindNote]');
      if (e.code === 'Escape') {
        note.textContent = 'Troca cancelada.';
      } else {
        const swapped = KeyBindings.set(action, e.code);
        note.textContent = swapped
          ? `${ACTION_LABELS[action]}: ${keyLabel(e.code)} · ${ACTION_LABELS[swapped]} passou para ${keyLabel(KeyBindings.get(swapped))}.`
          : `${ACTION_LABELS[action]}: ${keyLabel(e.code)}.`;
        audio.uiClick();
      }
      refreshBindings();
      return;
    }
    if (e.key !== 'Escape') return;
    e.stopImmediatePropagation();
    e.preventDefault();
    close();
  };
  window.addEventListener('keydown', onKey, true);

  m.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t === m || t.closest('[data-act=close]')) return close();
    const bind = t.closest<HTMLElement>('[data-bind]');
    if (bind) {
      capturing = bind.dataset['bind'] as Action;
      refreshBindings();
      const btn = q(`[data-bind=${capturing}]`);
      btn.classList.add('capturing');
      btn.textContent = 'Pressione…';
      return;
    }
    if (t.closest('[data-act=resetKeys]')) {
      KeyBindings.reset();
      capturing = null;
      refreshBindings();
      q('[data-el=bindNote]').textContent = 'Teclas restauradas para o padrão.';
      return;
    }
    const tab = t.closest<HTMLElement>('[data-tab]');
    if (tab) {
      m.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b === tab));
      m.querySelectorAll<HTMLElement>('[data-pane]').forEach(
        (p) => (p.hidden = p.dataset['pane'] !== tab.dataset['tab']),
      );
      audio.uiClick();
    }
  });
  m.addEventListener('input', (e) => {
    const el = e.target as HTMLInputElement | HTMLSelectElement;
    const key = el.dataset['opt'];
    if (!key) return;
    if (el instanceof HTMLInputElement && el.type === 'range') {
      const v = Number(el.value) / 100;
      (el.nextElementSibling as HTMLOutputElement).value = `${el.value}%`;
      if (key === 'volume') Settings.volume = v;
      if (key === 'sfxVolume') Settings.sfxVolume = v;
      if (key === 'ambienceVolume') Settings.ambienceVolume = v;
      audio.applySettings();
      return;
    }
    if (el instanceof HTMLInputElement && el.type === 'checkbox') {
      const v = el.checked;
      if (key === 'muted') Settings.muted = v;
      if (key === 'blood') Settings.blood = v;
      if (key === 'captions') Settings.captions = v;
      if (key === 'contrast') Settings.contrast = v;
      if (key === 'shake') Settings.shake = v;
      audio.applySettings();
      audio.uiClick();
      return;
    }
    if (key === 'lighting') Settings.lighting = el.value as LightingMode;
    if (key === 'hudScale') Settings.hudScale = Number(el.value);
  });
  uiRoot().appendChild(m);
  q<HTMLButtonElement>('[data-tab=audio]').focus();
  return m;
}

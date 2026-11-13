import { AudioEngine } from '../audio/AudioEngine';
import { Playtest } from '../telemetry/Playtest';
import {
  actionLabel,
  KeyBindings,
  keyLabel,
  keyName,
  PRESETS,
  presetLabel,
  type Action,
  type PresetId,
} from '../input/KeyBindings';
import { uiRoot } from './dom';
import { getLocale, LOCALES, LOCALE_NAMES, setLocale, text, type Locale } from './i18n';
import { Settings, type LightingMode, type Quality } from './SaveStore';

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
  'barricade',
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
  ACTION_ORDER.map((a) => {
    const alt = KeyBindings.getSecondary(a);
    return `<div class="bind-row"><span>${actionLabel(a)}</span>
      <button class="bind" data-bind="${a}" data-slot="0" data-testid="bind-${a}" title="${text('options.bindPrimary')}">${keyLabel(KeyBindings.get(a))}</button>
      <button class="bind alt ${alt ? '' : 'empty'}" data-bind="${a}" data-slot="1" data-testid="bind-${a}-alt" title="${text('options.bindAlt')}">${alt ? keyLabel(alt) : '—'}</button></div>`;
  }).join('');

const range = (key: string, label: string, value: number) =>
  `<label class="opt"><span>${label}</span><input type="range" min="0" max="100" step="5" data-opt="${key}" value="${Math.round(value * 100)}" /><output>${Math.round(value * 100)}%</output></label>`;
const check = (key: string, label: string, value: boolean, hint = '') =>
  `<label class="opt"><span>${label}${hint ? `<small>${hint}</small>` : ''}</span><input type="checkbox" data-opt="${key}" ${value ? 'checked' : ''} /></label>`;

const mouseRows = () => {
  const rows: [string, string][] = [
    [text('options.mouse.left'), text('options.mouse.leftDo')],
    [text('options.mouse.drag'), text('options.mouse.dragDo')],
    [text('options.mouse.right'), text('options.mouse.rightDo')],
    [text('options.mouse.shiftRight'), text('options.mouse.shiftRightDo')],
    [text('options.mouse.ctrlRight'), text('options.mouse.ctrlRightDo')],
    [text('options.mouse.minimap'), text('options.mouse.minimapDo')],
    [text('options.mouse.shiftCam'), text('options.mouse.shiftCamDo')],
    [text('options.mouse.wheel'), text('options.mouse.wheelDo')],
    [text('options.mouse.esc'), text('options.mouse.escDo')],
  ];
  return rows.map(([k, v]) => `<span class="kbd">${k}</span><span>${v}</span>`).join('');
};

/** Modal options screen (shared by the main menu and the in-mission pause flow). */
export function openOptions(onClose: () => void): HTMLDivElement {
  const audio = AudioEngine.get();
  const m = document.createElement('div');
  m.className = 'overlay-menu options';
  m.dataset['testid'] = 'options';
  const tabs = [
    ['audio', 'options.audio'],
    ['video', 'options.video'],
    ['access', 'options.access'],
    ['controls', 'options.controls'],
    ['playtest', 'options.playtest'],
  ] as const;
  const languages = LOCALES.map(
    (id) =>
      `<option value="${id}" ${id === getLocale() ? 'selected' : ''}>${LOCALE_NAMES[id]}</option>`,
  ).join('');

  const paint = (active = 'audio') => {
    m.innerHTML = `<div class="card panel options-card" role="dialog" aria-label="${text('options.title')}">
    <div class="options-head"><h3>${text('options.title')}</h3><button data-act="close" data-testid="btn-options-close" aria-label="${text('options.close')}">✕</button></div>
    <label class="opt"><span>${text('options.language')}</span>
      <select data-opt="locale" data-testid="locale-select">${languages}</select></label>
    <div class="tabs">${tabs.map(([id, label]) => `<button data-tab="${id}" class="${id === active ? 'active' : ''}">${text(label)}</button>`).join('')}</div>
    <section data-pane="audio" ${active === 'audio' ? '' : 'hidden'}>
      ${range('volume', text('options.volume'), Settings.volume)}
      ${range('sfxVolume', text('options.sfx'), Settings.sfxVolume)}
      ${range('musicVolume', text('options.music'), Settings.musicVolume)}
      ${range('ambienceVolume', text('options.ambience'), Settings.ambienceVolume)}
      ${check('muted', text('options.mute'), Settings.muted, text('options.muteHint', { key: keyName('mute') }))}
    </section>
    <section data-pane="video" ${active === 'video' ? '' : 'hidden'}>
      <label class="opt"><span>${text('options.lighting')}<small>${text('options.lightingHint')}</small></span>
        <select data-opt="lighting"><option value="dusk">${text('options.dusk')}</option><option value="day">${text('options.day')}</option></select></label>
      <label class="opt"><span>${text('options.quality')}<small>${text('options.qualityHint')}</small></span>
        <select data-opt="quality"><option value="high">${text('options.high')}</option><option value="medium">${text('options.medium')}</option><option value="low">${text('options.low')}</option></select></label>
      ${check('showFps', text('options.fps'), Settings.showFps)}
      ${check('blood', text('options.blood'), Settings.blood)}
      <label class="opt"><span>${text('options.hudScale')}</span>
        <select data-opt="hudScale"><option value="1">100%</option><option value="1.25">125%</option><option value="1.5">150%</option></select></label>
    </section>
    <section data-pane="access" ${active === 'access' ? '' : 'hidden'}>
      ${check('captions', text('options.captions'), Settings.captions, text('options.captionsHint'))}
      ${check('contrast', text('options.contrast'), Settings.contrast, text('options.contrastHint'))}
      ${check('shake', text('options.shake'), Settings.shake, text('options.shakeHint'))}
      ${check('tips', text('options.tips'), Settings.tips, text('options.tipsHint'))}
      <label class="opt"><span>${text('options.resetTips')}<small>${text('options.resetTipsHint')}</small></span><button data-act="resetTips">${text('options.reset')}</button></label>
      <p class="small">${text('options.accessNote')}</p>
    </section>
    <section data-pane="controls" ${active === 'controls' ? '' : 'hidden'}>
      <div class="controls-grid">${mouseRows()}</div>
      <label class="opt"><span>${text('options.camera')}<small>${text('options.cameraHint')}</small></span>
        <input type="range" min="50" max="200" step="10" data-opt="cameraSpeed" value="${Math.round(Settings.cameraSpeed * 100)}" /><output>${Math.round(Settings.cameraSpeed * 100)}%</output></label>
      <h4 class="bind-head">${text('options.keyboard')}
        <span class="presets">${(Object.keys(PRESETS) as PresetId[])
          .map(
            (id) =>
              `<button data-preset="${id}" data-testid="preset-${id}" class="small-btn">${presetLabel(id)}</button>`,
          )
          .join('')}</span></h4>
      <div class="bind-cols small"><span></span><span>${text('options.primary')}</span><span>${text('options.alternate')}</span></div>
      <div class="bindings" data-el="bindings">${bindingRows()}</div>
      <p class="small" data-el="bindNote">${text('options.bindNote')}</p>
    </section>
    <section data-pane="playtest" ${active === 'playtest' ? '' : 'hidden'}>
      <p class="small">${text('options.playtestIntro')}</p>
      ${check('playtest', text('options.playtestOn'), Playtest.enabled, text('options.playtestHint'))}
      <label class="opt"><span>${text('options.playtestTester')}<small>${text('options.playtestTesterHint')}</small></span>
        <input type="text" maxlength="60" data-el="tester" data-testid="playtest-tester" autocomplete="off" /></label>
      <label class="opt"><span>${text('options.playtestLog')}<small data-el="ptCount" data-testid="playtest-count">${text('options.playtestCount', { n: Playtest.count })}</small></span>
        <span class="presets"><button data-act="ptExport" data-testid="btn-playtest-export" class="small-btn">${text('options.playtestExport')}</button>
        <button data-act="ptClear" data-testid="btn-playtest-clear" class="small-btn">${text('options.playtestClear')}</button></span></label>
      <p class="small">${text('options.playtestNote')}</p>
    </section>
  </div>`;
    q<HTMLSelectElement>('[data-opt=locale]').value = getLocale();
    q<HTMLSelectElement>('[data-opt=lighting]').value = Settings.lighting;
    q<HTMLSelectElement>('[data-opt=hudScale]').value = String(Settings.hudScale);
    q<HTMLSelectElement>('[data-opt=quality]').value = Settings.quality;
  };

  const q = <T extends HTMLElement>(sel: string) => m.querySelector(sel) as T;
  paint();

  const close = () => {
    m.remove();
    window.removeEventListener('keydown', onKey, true);
    onClose();
  };
  let capturing: { action: Action; slot: 0 | 1 } | null = null;
  const refreshBindings = () => {
    q('[data-el=bindings]').innerHTML = bindingRows();
  };
  const onKey = (e: KeyboardEvent) => {
    if (capturing) {
      e.stopImmediatePropagation();
      e.preventDefault();
      const { action, slot } = capturing;
      capturing = null;
      const note = q('[data-el=bindNote]');
      if (e.code === 'Escape') {
        note.textContent = text('options.bindCancelled');
      } else if (slot === 1 && (e.code === 'Delete' || e.code === 'Backspace')) {
        KeyBindings.clearSecondary(action);
        note.textContent = text('options.bindCleared', { action: actionLabel(action) });
      } else {
        const r = KeyBindings.set(action, e.code, slot);
        note.textContent = r.refused
          ? text('options.bindRefused', { key: keyLabel(e.code) })
          : r.swapped
            ? text('options.bindSwapped', {
                action: actionLabel(action),
                key: keyLabel(e.code),
                other: actionLabel(r.swapped),
                keys: KeyBindings.codes(r.swapped).map(keyLabel).join(' / '),
              })
            : text('options.bindSet', { action: actionLabel(action), key: keyLabel(e.code) });
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
      capturing = {
        action: bind.dataset['bind'] as Action,
        slot: bind.dataset['slot'] === '1' ? 1 : 0,
      };
      refreshBindings();
      const btn = q(`[data-bind=${capturing.action}][data-slot="${capturing.slot}"]`);
      btn.classList.add('capturing');
      btn.textContent = text('options.press');
      return;
    }
    if (t.closest('[data-act=ptExport]')) {
      Playtest.download(q<HTMLInputElement>('[data-el=tester]').value);
      audio.uiClick();
      return;
    }
    const clearBtn = t.closest<HTMLButtonElement>('[data-act=ptClear]');
    if (clearBtn) {
      // two clicks: the log cannot be recovered once cleared
      if (clearBtn.dataset['armed'] !== '1') {
        clearBtn.dataset['armed'] = '1';
        clearBtn.textContent = text('options.playtestConfirm');
        return;
      }
      Playtest.clear();
      clearBtn.dataset['armed'] = '';
      clearBtn.textContent = text('options.playtestClear');
      q('[data-el=ptCount]').textContent = text('options.playtestCount', { n: Playtest.count });
      audio.uiClick();
      return;
    }
    if (t.closest('[data-act=resetTips]')) {
      Settings.resetTips();
      Settings.tips = true;
      (q('[data-opt=tips]') as HTMLInputElement).checked = true;
      return;
    }
    const preset = t.closest<HTMLElement>('[data-preset]');
    if (preset) {
      const id = preset.dataset['preset'] as PresetId;
      KeyBindings.applyPreset(id);
      capturing = null;
      refreshBindings();
      q('[data-el=bindNote]').textContent = text('options.presetApplied', {
        preset: presetLabel(id),
      });
      audio.uiClick();
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
    if (key === 'locale') {
      const next = el.value as Locale;
      if (next === getLocale()) return;
      const active = m.querySelector<HTMLElement>('[data-tab].active')?.dataset['tab'] ?? 'audio';
      setLocale(next);
      paint(active);
      audio.uiClick();
      return;
    }
    if (el instanceof HTMLInputElement && el.type === 'range') {
      const v = Number(el.value) / 100;
      (el.nextElementSibling as HTMLOutputElement).value = `${el.value}%`;
      if (key === 'volume') Settings.volume = v;
      if (key === 'sfxVolume') Settings.sfxVolume = v;
      if (key === 'ambienceVolume') Settings.ambienceVolume = v;
      if (key === 'musicVolume') Settings.musicVolume = v;
      if (key === 'cameraSpeed') Settings.cameraSpeed = v;
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
      if (key === 'tips') Settings.tips = v;
      if (key === 'showFps') Settings.showFps = v;
      if (key === 'playtest') {
        Playtest.enabled = v;
        q('[data-el=ptCount]').textContent = text('options.playtestCount', { n: Playtest.count });
      }
      audio.applySettings();
      audio.uiClick();
      return;
    }
    if (key === 'lighting') Settings.lighting = el.value as LightingMode;
    if (key === 'hudScale') Settings.hudScale = Number(el.value);
    if (key === 'quality') Settings.quality = el.value as Quality;
  });
  uiRoot().appendChild(m);
  q<HTMLButtonElement>('[data-tab=audio]').focus();
  return m;
}

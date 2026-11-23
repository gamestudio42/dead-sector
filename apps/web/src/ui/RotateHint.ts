import { coarsePointer, onLocale, text } from './i18n';

const DISMISS_KEY = 'dead-sector.rotateHint';

function readDismissed(): boolean {
  try {
    return sessionStorage.getItem(DISMISS_KEY) === 'off';
  } catch {
    return false;
  }
}

function phonePortrait(): boolean {
  if (readDismissed() || !coarsePointer()) return false;
  return window.matchMedia('(orientation: portrait) and (max-width: 540px)').matches;
}

/**
 * The installed app asks for landscape. On a phone held upright, say so once per visit.
 * The banner sits outside `#ui` so scene changes do not wipe it.
 */
export function mountRotateHint(): void {
  const el = document.createElement('div');
  el.className = 'rotate-hint';
  el.dataset['testid'] = 'rotate-hint';
  el.hidden = true;
  const write = (): void => {
    el.innerHTML = `<p>${text('touch.rotate')}</p><button type="button" data-act="dismiss" aria-label="${text('touch.dismiss')}">✕</button>`;
  };
  write();
  el.addEventListener('click', (e) => {
    if (!(e.target as HTMLElement).closest('[data-act=dismiss]')) return;
    try {
      sessionStorage.setItem(DISMISS_KEY, 'off');
    } catch {
      /* the hint still hides for this page */
    }
    sync();
  });
  document.body.appendChild(el);
  const sync = (): void => {
    const show = phonePortrait();
    el.hidden = !show;
    document.documentElement.style.setProperty(
      '--chrome-top',
      show ? `${el.offsetHeight}px` : '0px',
    );
  };
  onLocale(() => {
    write();
    sync();
  });
  const portrait = window.matchMedia('(orientation: portrait)');
  const narrow = window.matchMedia('(max-width: 540px)');
  portrait.addEventListener('change', sync);
  narrow.addEventListener('change', sync);
  window.addEventListener('resize', sync);
  sync();
}

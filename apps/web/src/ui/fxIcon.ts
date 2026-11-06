import manifest from '../../public/fx/manifest.json';
import { Settings } from './SaveStore';

type FxEntry = {
  frames: number;
  frameWidth: number;
  frameHeight: number;
  fps: number;
  columns?: number;
  loop?: boolean;
  hold?: boolean;
};

/**
 * A baked effect played in the HTML interface: the strip is a CSS background stepped through its
 * frames. Strips are drawn at twice their on-screen size, so they stay sharp on high-DPI screens.
 * `still` (or reduced motion) shows one frame instead: the last for a mark that holds, else the middle.
 */
export function fxIcon(
  name: keyof typeof manifest.effects,
  o: { still?: boolean; label?: string; size?: number; sync?: boolean } = {},
): string {
  const e = manifest.effects[name] as FxEntry;
  if ((e.columns ?? e.frames) < e.frames) return ''; // multi-row sheets are for the game canvas only
  // drawn at twice the size it is shown at, unless the caller wants it bigger
  const w = (e.frameWidth / 2) * (o.size ?? 1);
  const h = (e.frameHeight / 2) * (o.size ?? 1);
  const still = o.still || !Settings.shake;
  const frame = still ? (e.hold ? e.frames - 1 : Math.floor(e.frames / 2)) : 0;
  const vars = [
    // absolute: a url() inside a custom property resolves against the stylesheet, not the page
    `--fx-url:url(${new URL(`./fx/${name}.png`, document.baseURI).href})`,
    `--fx-w:${w}px`,
    `--fx-h:${h}px`,
    `--fx-sheet:${w * e.frames}px`,
    `--fx-start:${-frame * w}px`,
    // loops step through every frame and wrap; one-shots stop on their last frame
    `--fx-end:${e.loop ? -e.frames * w : -(e.frames - 1) * w}px`,
    `--fx-steps:${e.loop ? `steps(${e.frames})` : `steps(${e.frames - 1}, jump-none)`}`,
    `--fx-dur:${e.frames / e.fps}s`,
    `--fx-iter:${e.loop ? 'infinite' : '1'}`,
    // a loop in markup that is rebuilt often keeps its phase from the clock instead of restarting;
    // the token is resolved when the markup is written (resolveSync), so cached markup stays equal
    ...(o.sync && e.loop ? [`animation-delay:{{fx-sync:${e.frames / e.fps}}}`] : []),
  ].join(';');
  const aria = o.label ? `role="img" aria-label="${o.label}"` : 'aria-hidden="true"';
  return `<span class="fx-icon ${still ? 'still' : ''}" data-fx="${name}" style="${vars}" ${aria}></span>`;
}

/** The animation that goes with a campaign report line, if any. */
export function noticeIcon(kind: string, still = false): string {
  const name = kind === 'convoy' ? 'convoy' : kind === 'sector-lost' ? 'sector_lost' : null;
  return name
    ? fxIcon(name, { still }).replace('class="fx-icon', 'class="notice-icon fx-icon')
    : '';
}

/** Replaces sync tokens with the delay that puts each loop at the clock's phase right now. */
export function resolveSync(html: string): string {
  const now = Date.now() / 1000;
  return html.replace(
    /\{\{fx-sync:([\d.]+)\}\}/g,
    (_, period: string) => `${-(now % Number(period)).toFixed(3)}s`,
  );
}

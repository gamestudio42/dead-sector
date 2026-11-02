import type { CampaignEnd, CampaignNotice, OperationBlock } from '@dead-sector/sim';
import { de } from '../locales/de';
import { en, type Catalog } from '../locales/en';
import { es } from '../locales/es';
import { fr } from '../locales/fr';
import { ptBR } from '../locales/pt-BR';

export const LOCALES = ['en', 'pt-BR', 'es', 'fr', 'de'] as const;
export type Locale = (typeof LOCALES)[number];

/** Endonyms, so the selector reads the same in every language. */
export const LOCALE_NAMES: Record<Locale, string> = {
  en: 'English',
  'pt-BR': 'Português',
  es: 'Español',
  fr: 'Français',
  de: 'Deutsch',
};

const DICTS: Record<Locale, Catalog> = { en, 'pt-BR': ptBR, es, fr, de };
const STORE_KEY = 'dead-sector.locale';

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

function readLanguages(): readonly string[] {
  if (typeof navigator === 'undefined') return [];
  if (navigator.languages?.length) return navigator.languages;
  return navigator.language ? [navigator.language] : [];
}

/** The browser language when it is one of the five; any Portuguese counts as pt-BR. */
export function browserLocale(languages: readonly string[] = readLanguages()): Locale {
  for (const tag of languages) {
    const base = (tag ?? '').toLowerCase().split('-')[0];
    if (base === 'pt') return 'pt-BR';
    if (isLocale(base)) return base;
  }
  return 'pt-BR';
}

function readStored(): string | null {
  try {
    return localStorage.getItem(STORE_KEY);
  } catch {
    return null;
  }
}

function readQuery(): string | null {
  if (typeof location === 'undefined') return null;
  try {
    return new URLSearchParams(location.search).get('lang');
  } catch {
    return null;
  }
}

let locale: Locale = 'pt-BR';
const listeners = new Set<() => void>();

/** Runs after a language change, so open screens can redraw. */
export function onLocale(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setLocale(next: Locale, persist = true): void {
  locale = next;
  if (persist) {
    try {
      localStorage.setItem(STORE_KEY, next);
    } catch {
      /* private mode keeps the choice for this session */
    }
  }
  if (typeof document !== 'undefined') document.documentElement.lang = next;
  for (const fn of listeners) fn();
}

export function getLocale(): Locale {
  return locale;
}

/**
 * Saved choice, otherwise the browser, otherwise Portuguese. `?lang=` forces a language and
 * remembers it.
 */
export function bootLocale(): Locale {
  const forced = readQuery();
  if (isLocale(forced)) {
    setLocale(forced, true);
    return forced;
  }
  const stored = readStored();
  if (isLocale(stored)) {
    setLocale(stored, false);
    return stored;
  }
  setLocale(browserLocale(), false);
  return locale;
}

bootLocale();

export function catalog(): Catalog {
  return DICTS[locale];
}

/** Texts of the mission being played. The JSON copy is the Portuguese reserve. */
export interface MissionTexts {
  area: string;
  item: string;
  itemTag: string;
  itemDone: string;
  person: string;
  personTag: string;
  objectives: Record<string, string>;
  intel: string[];
}

let missionId = 'a-ultima-farmacia';
let reserve: MissionTexts | null = null;

/** Remembers which mission is on screen. The catalog supplies the sentences; JSON is the reserve. */
export function setMissionTexts(texts: MissionTexts, id?: string): void {
  reserve = texts;
  if (id) missionId = id;
}

type MissionCopy = Catalog['missions'][keyof Catalog['missions']];

function cap(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

function titleTag(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s;
}

export function activeMission(): MissionCopy {
  const known = (catalog().missions as Record<string, MissionCopy>)[missionId];
  if (known) return known;
  if (reserve) {
    const fallback = catalog().missions['a-ultima-farmacia'];
    return {
      ...fallback,
      displayName: reserve.area,
      briefing: '',
      civilianRole: reserve.person,
      area: reserve.area,
      item: reserve.item,
      itemTag: reserve.itemTag,
      itemDone: reserve.itemDone,
      person: reserve.person,
      personTag: reserve.personTag,
      intel: reserve.intel,
      objectives: { ...fallback.objectives, ...reserve.objectives },
    };
  }
  return catalog().missions['a-ultima-farmacia'];
}

/** Fills `{item}`, `{person}` and any extra `{name}` left in a catalog sentence. */
export function fill(template: string, extra: Record<string, string | number> = {}): string {
  const m = activeMission();
  const map: Record<string, string> = {
    item: m.item,
    Item: cap(m.item),
    person: m.person,
    Person: cap(m.person),
    personTag: m.personTag,
    PersonTag: titleTag(m.personTag),
    itemTag: m.itemTag,
    itemDone: m.itemDone,
    area: m.area,
  };
  for (const [key, value] of Object.entries(extra)) map[key] = String(value);
  return template.replace(/\{(\w+)\}/g, (all, key: string) =>
    key in map ? (map[key] ?? all) : all,
  );
}

function branch<T extends object>(get: () => T): T {
  return new Proxy({} as T, {
    get(_target, prop) {
      if (typeof prop !== 'string') return undefined;
      const value = (get() as Record<string, unknown>)[prop];
      if (typeof value === 'string') return fill(value);
      if (value && typeof value === 'object' && !Array.isArray(value))
        return branch(() => (get() as Record<string, unknown>)[prop] as object);
      return value;
    },
  });
}

type Dict = Record<string, string>;

/** The strings the HUD and the debrief already read by key. */
export interface Strings {
  objectives: Dict;
  bands: Dict;
  activity: Dict;
  reasons: Dict;
  orders: Dict;
  orderStatus: Dict;
  blocked: Dict;
  policy: Dict;
  mode: Dict;
  infection: Dict;
  zombie: Dict;
  alarm: string[];
  spawner: Dict;
  outcome: Dict;
  endReason: Dict;
  noise: Dict;
}

const gameStrings = branch(() => catalog().game);

/** HUD strings. Objectives follow the mission on screen; the rest is the active catalog. */
export const T: Strings = new Proxy(gameStrings, {
  get(target, prop, receiver) {
    if (prop === 'objectives') return branch(() => activeMission().objectives);
    return Reflect.get(target, prop, receiver);
  },
});

export const MT: MissionTexts = new Proxy({} as MissionTexts, {
  get(_target, prop) {
    if (typeof prop !== 'string') return undefined;
    return (activeMission() as unknown as Record<string, unknown>)[prop];
  },
});

/** A sentence from the active catalog, by dotted path. */
export function text(path: string, extra: Record<string, string | number> = {}): string {
  let cur: unknown = catalog();
  for (const part of path.split('.')) {
    if (!cur || typeof cur !== 'object') return path;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? fill(cur, extra) : path;
}

export function missionTitle(id: string, fallbackName: string): string {
  return (catalog().missions as Record<string, MissionCopy>)[id]?.displayName ?? fallbackName;
}

export function missionBriefing(id: string, fallbackText: string): string {
  return (catalog().missions as Record<string, MissionCopy>)[id]?.briefing ?? fallbackText;
}

export function sectorBlurb(id: string, fallbackText: string): string {
  return (catalog().campaign.sectors as Record<string, string>)[id] ?? fallbackText;
}

export function roleLabel(templateId: string, fallbackRole: string, objective = false): string {
  if (objective) return activeMission().civilianRole || fallbackRole;
  return (catalog().roles as Record<string, string>)[templateId] ?? fallbackRole;
}

export function weaponLabel(id: string, fallbackName: string): string {
  return (catalog().weapons as Record<string, string>)[id] ?? fallbackName;
}

export function formatNotice(notice: CampaignNotice): string {
  if (notice.kind === 'legacy') return notice.text;
  const copy = catalog().campaign;
  const line = copy.notices;
  const piece = (n: number, template: string) => (n ? fill(template, { n }) : '');
  switch (notice.kind) {
    case 'did-not-return':
      return fill(line.didNotReturn, { name: notice.name });
    case 'left-behind':
      return fill(line.leftBehind, { name: notice.name });
    case 'rescued-safe':
      return fill(line.rescuedSafe, { name: notice.name });
    case 'brought':
      return fill(line.brought, {
        bits: [
          piece(notice.food, line.food),
          piece(notice.medicine, line.medicine),
          piece(notice.ammo, line.ammo),
          piece(notice.parts, line.parts),
          piece(notice.people, line.people),
        ]
          .filter(Boolean)
          .join(', '),
      });
    case 'convoy':
      return fill(line.convoy, { count: notice.count });
    case 'noise-heat':
      return fill(line.noiseHeat, { sector: notice.sector });
    case 'sector-lost':
      return fill(line.sectorLost, { sector: notice.sector });
    case 'infected-returned':
      return fill(line.infectedReturned, { sector: notice.sector });
    case 'shelter-surrounded':
      return fill(line.shelterSurrounded, { sector: notice.sector });
    case 'treated':
      return fill(line.treated, { name: notice.name });
    case 'turned':
      return fill(line.turned, { name: notice.name });
    case 'worsened':
      return fill(line.worsened, { name: notice.name, stage: copy.stage[notice.stage] });
    case 'starved':
      return fill(line.starved, { lost: notice.lost });
    case 'no-food':
      return line.noFood;
    case 'recovered':
      return fill(line.recovered, {
        name: notice.name,
        before: notice.before,
        after: notice.after,
      });
    case 'ammo-short':
      return line.ammoShort;
  }
}

export function formatEnd(end: CampaignEnd | null): string {
  if (!end) return '';
  if (end.kind === 'legacy') return end.text;
  if (end.kind === 'evacuated')
    return fill(catalog().campaign.ends.evacuated, { count: end.count });
  return catalog().campaign.ends[end.kind];
}

export function formatBlock(code: OperationBlock | null): string {
  return code ? catalog().campaign.blocks[code] : '';
}

export const fmtTime = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * Rebindable keyboard shortcuts. Bindings use `KeyboardEvent.code` (physical key), so they work
 * the same on ABNT2, US or other layouts. Esc is reserved for menus and cannot be rebound.
 */
export type Action =
  | 'squad1'
  | 'squad2'
  | 'squad3'
  | 'squad4'
  | 'modeSneak'
  | 'modeMove'
  | 'modeSprint'
  | 'hold'
  | 'hide'
  | 'retreat'
  | 'regroup'
  | 'firePolicy'
  | 'barricade'
  | 'pause'
  | 'speed'
  | 'quicksave'
  | 'quickload'
  | 'mute'
  | 'debug'
  | 'panUp'
  | 'panDown'
  | 'panLeft'
  | 'panRight';

/** A preset gives every action a primary key and, optionally, a secondary one. */
export type Slots = [string, string | null];
export type PresetId = 'wasd' | 'arrows';
export interface BindResult {
  /** Action that gave up the key (it received this action's previous key). */
  swapped?: Action;
  /** The change would leave an action without any key, or the key is reserved. */
  refused?: boolean;
}

/**
 * Default "WASD" layout (playtest feedback): the camera on WASD with the arrows as alternatives,
 * orders around it — Q retreat, E hide, Z/X/C movement modes, V hold.
 */
const WASD: Record<Action, Slots> = {
  squad1: ['Digit1', null],
  squad2: ['Digit2', null],
  squad3: ['Digit3', null],
  squad4: ['Digit4', null],
  modeSneak: ['KeyZ', null],
  modeMove: ['KeyX', null],
  modeSprint: ['KeyC', null],
  hold: ['KeyV', null],
  hide: ['KeyE', null],
  retreat: ['KeyQ', null],
  regroup: ['KeyG', null],
  firePolicy: ['KeyF', null],
  barricade: ['KeyB', null],
  pause: ['Space', null],
  speed: ['Tab', null],
  quicksave: ['F5', null],
  quickload: ['F9', null],
  mute: ['KeyM', null],
  debug: ['Backquote', null],
  panUp: ['KeyW', 'ArrowUp'],
  panDown: ['KeyS', 'ArrowDown'],
  panLeft: ['KeyA', 'ArrowLeft'],
  panRight: ['KeyD', 'ArrowRight'],
};

/** The original layout: camera on the arrows, Q/W/E movement modes, H/T/R/G orders. */
const ARROWS: Record<Action, Slots> = {
  ...WASD,
  modeSneak: ['KeyQ', null],
  modeMove: ['KeyW', null],
  modeSprint: ['KeyE', null],
  hold: ['KeyH', null],
  hide: ['KeyT', null],
  retreat: ['KeyR', null],
  panUp: ['ArrowUp', null],
  panDown: ['ArrowDown', null],
  panLeft: ['ArrowLeft', null],
  panRight: ['ArrowRight', null],
};

export const PRESETS: Record<PresetId, { label: string; slots: Record<Action, Slots> }> = {
  wasd: { label: 'WASD (padrão)', slots: WASD },
  arrows: { label: 'Setas (clássico)', slots: ARROWS },
};

/** Primary key of every action in the default layout. */
export const DEFAULT_BINDINGS: Record<Action, string> = Object.fromEntries(
  Object.entries(WASD).map(([a, [p]]) => [a, p]),
) as Record<Action, string>;

export const ACTION_LABELS: Record<Action, string> = {
  squad1: 'Selecionar esquadrão 1',
  squad2: 'Selecionar esquadrão 2',
  squad3: 'Selecionar esquadrão 3',
  squad4: 'Selecionar esquadrão 4',
  modeSneak: 'Modo furtivo',
  modeMove: 'Modo normal',
  modeSprint: 'Modo correr',
  hold: 'Manter posição',
  hide: 'Esconder',
  retreat: 'Retirada',
  regroup: 'Reagrupar no líder',
  firePolicy: 'Disciplina de fogo',
  barricade: 'Barricar porta/janela sob o cursor',
  pause: 'Pausar / retomar',
  speed: 'Velocidade 1× / 2×',
  quicksave: 'Salvamento rápido',
  quickload: 'Carregar salvamento rápido',
  mute: 'Ligar/desligar som',
  debug: 'Sobreposição de depuração',
  panUp: 'Câmera: cima',
  panDown: 'Câmera: baixo',
  panLeft: 'Câmera: esquerda',
  panRight: 'Câmera: direita',
};

const STORE_KEY = 'dead-sector:keys';
export const RESERVED_CODES = new Set(['Escape']);

/** Human-readable key name for a `KeyboardEvent.code`. */
export function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return `Num ${code.slice(6)}`;
  const names: Record<string, string> = {
    Space: 'Espaço',
    Tab: 'Tab',
    Backquote: '`',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Enter: 'Enter',
    Backspace: 'Backspace',
    Minus: '-',
    Equal: '=',
    BracketLeft: '[',
    BracketRight: ']',
    Semicolon: ';',
    Quote: "'",
    Comma: ',',
    Period: '.',
    Slash: '/',
    Backslash: '\\',
    IntlBackslash: '\\',
    ShiftLeft: 'Shift esq.',
    ShiftRight: 'Shift dir.',
    ControlLeft: 'Ctrl esq.',
    ControlRight: 'Ctrl dir.',
    AltLeft: 'Alt',
    AltRight: 'AltGr',
  };
  return names[code] ?? code;
}

const ACTIONS = Object.keys(WASD) as Action[];
const clone = (slots: Record<Action, Slots>): Record<Action, Slots> =>
  Object.fromEntries(ACTIONS.map((a) => [a, [...slots[a]] as Slots])) as Record<Action, Slots>;
const validCode = (c: unknown): c is string =>
  typeof c === 'string' && !!c && !RESERVED_CODES.has(c);

/**
 * Version 1 stored one key per action and its defaults were the classic layout. Actions still on
 * an old default move to the new layout; anything the player chose is kept, and new defaults
 * never steal a key the player picked for something else.
 */
export function migrateV1(stored: Partial<Record<Action, string>>): Record<Action, Slots> {
  const out = clone(WASD);
  const custom = ACTIONS.filter((a) => validCode(stored[a]) && stored[a] !== ARROWS[a][0]);
  const taken = new Set<string>();
  for (const a of custom) {
    out[a] = [stored[a] as string, null];
    taken.add(stored[a] as string);
  }
  for (const a of ACTIONS) {
    if (custom.includes(a)) continue;
    const [p, s2] = WASD[a];
    const old = ARROWS[a][0];
    const primary = !taken.has(p) ? p : !taken.has(old) ? old : null;
    if (!primary) continue; // keep the new default; a clash is resolved by the swap rule on next edit
    out[a] = [primary, s2 && !taken.has(s2) && s2 !== primary ? s2 : null];
    taken.add(primary);
    if (out[a][1]) taken.add(out[a][1] as string);
  }
  return out;
}

function load(): Record<Action, Slots> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? 'null') as
      { version: 2; keys: Partial<Record<Action, Slots>> } | Partial<Record<Action, string>> | null;
    if (!raw) return clone(WASD);
    if ('version' in raw && raw.version === 2) {
      const out = clone(WASD);
      for (const a of ACTIONS) {
        const k = raw.keys[a];
        if (Array.isArray(k) && validCode(k[0])) out[a] = [k[0], validCode(k[1]) ? k[1] : null];
      }
      return out;
    }
    return migrateV1(raw as Partial<Record<Action, string>>);
  } catch {
    return clone(WASD);
  }
}

let bindings = load();

export const KeyBindings = {
  /** Primary key of an action. */
  get(action: Action): string {
    return bindings[action][0];
  },
  getSecondary(action: Action): string | null {
    return bindings[action][1];
  },
  /** Every key that triggers an action (primary first). */
  codes(action: Action): string[] {
    const [p, s2] = bindings[action];
    return s2 ? [p, s2] : [p];
  },
  all(): Record<Action, string> {
    return Object.fromEntries(ACTIONS.map((a) => [a, bindings[a][0]])) as Record<Action, string>;
  },
  /** The action bound to this physical key (primary or secondary), if any. */
  actionFor(code: string): Action | null {
    for (const a of ACTIONS) if (bindings[a][0] === code || bindings[a][1] === code) return a;
    return null;
  },
  /**
   * Binds `code` to an action's primary (slot 0) or secondary (slot 1) key. If another action
   * already uses that key, it takes this action's previous key in the same place (swap). A change
   * that would leave some action without a primary key is refused.
   */
  set(action: Action, code: string, slot: 0 | 1 = 0): BindResult {
    if (RESERVED_CODES.has(code)) return { refused: true };
    const mine = bindings[action];
    const prev = mine[slot];
    if (prev === code) return {};
    const other = KeyBindings.actionFor(code);
    if (other === action) {
      // the key is already in this action's other slot: swap the two slots
      if (slot === 0) bindings[action] = [code, prev];
      else if (prev) bindings[action] = [prev, code];
      else return { refused: true }; // moving the only key out of the primary slot
      persist();
      return {};
    }
    if (other) {
      const theirs = bindings[other];
      const otherSlot: 0 | 1 = theirs[0] === code ? 0 : 1;
      if (otherSlot === 1) theirs[1] = prev;
      else if (prev) theirs[0] = prev;
      else if (theirs[1]) bindings[other] = [theirs[1], null];
      else return { refused: true };
    }
    mine[slot] = code;
    persist();
    return other ? { swapped: other } : {};
  },
  clearSecondary(action: Action): void {
    bindings[action][1] = null;
    persist();
  },
  applyPreset(id: PresetId): void {
    bindings = clone(PRESETS[id].slots);
    persist();
  },
  reset(): void {
    KeyBindings.applyPreset('wasd');
  },
  /** For tests: reload from storage. */
  reload(): void {
    bindings = load();
  },
};

function persist(): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify({ version: 2, keys: bindings }));
  } catch {
    /* bindings stay for this session only */
  }
}

/** Live name of an action's key(s) for texts and tooltips, e.g. "Z" or "W / ↑". */
export function keyName(action: Action, withAlt = false): string {
  const codes = KeyBindings.codes(action);
  return (withAlt ? codes : codes.slice(0, 1)).map(keyLabel).join(' / ');
}

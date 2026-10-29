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

export const DEFAULT_BINDINGS: Record<Action, string> = {
  squad1: 'Digit1',
  squad2: 'Digit2',
  squad3: 'Digit3',
  squad4: 'Digit4',
  modeSneak: 'KeyQ',
  modeMove: 'KeyW',
  modeSprint: 'KeyE',
  hold: 'KeyH',
  hide: 'KeyT',
  retreat: 'KeyR',
  regroup: 'KeyG',
  firePolicy: 'KeyF',
  barricade: 'KeyB',
  pause: 'Space',
  speed: 'Tab',
  quicksave: 'F5',
  quickload: 'F9',
  mute: 'KeyM',
  debug: 'Backquote',
  panUp: 'ArrowUp',
  panDown: 'ArrowDown',
  panLeft: 'ArrowLeft',
  panRight: 'ArrowRight',
};

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

function load(): Record<Action, string> {
  try {
    const raw = JSON.parse(localStorage.getItem(STORE_KEY) ?? '{}') as Partial<
      Record<Action, string>
    >;
    const out = { ...DEFAULT_BINDINGS };
    for (const a of Object.keys(DEFAULT_BINDINGS) as Action[]) {
      const code = raw[a];
      if (typeof code === 'string' && code && !RESERVED_CODES.has(code)) out[a] = code;
    }
    return out;
  } catch {
    return { ...DEFAULT_BINDINGS };
  }
}

let bindings = load();

export const KeyBindings = {
  get(action: Action): string {
    return bindings[action];
  },
  all(): Record<Action, string> {
    return { ...bindings };
  },
  /** The action bound to this physical key, if any. */
  actionFor(code: string): Action | null {
    for (const a of Object.keys(bindings) as Action[]) if (bindings[a] === code) return a;
    return null;
  },
  /**
   * Binds `code` to `action`. If another action already used that key, the two swap keys so no
   * action is ever left unbound. Returns the action that was swapped, if any.
   */
  set(action: Action, code: string): Action | null {
    if (RESERVED_CODES.has(code)) return null;
    const other = KeyBindings.actionFor(code);
    if (other && other !== action) bindings[other] = bindings[action];
    bindings[action] = code;
    persist();
    return other && other !== action ? other : null;
  },
  reset(): void {
    bindings = { ...DEFAULT_BINDINGS };
    persist();
  },
  /** For tests: reload from storage. */
  reload(): void {
    bindings = load();
  },
};

function persist(): void {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(bindings));
  } catch {
    /* bindings stay for this session only */
  }
}

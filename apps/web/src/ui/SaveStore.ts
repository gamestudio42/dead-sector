/** Save adapter: IndexedDB with a localStorage fallback (both local only, no server). */
const DB = 'dead-sector';
const STORE = 'saves';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('no indexedDB'));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export const SaveStore = {
  async save(slot: string, data: string): Promise<void> {
    try {
      const db = await openDb();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(data, slot);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      localStorage.setItem(`${DB}:${slot}`, data);
    }
  },
  async load(slot: string): Promise<string | null> {
    try {
      const db = await openDb();
      const value = await new Promise<unknown>((resolve, reject) => {
        const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(slot);
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
      if (typeof value === 'string') return value;
    } catch {
      /* fall through to localStorage */
    }
    return localStorage.getItem(`${DB}:${slot}`);
  },
};

function readStored(key: string): string | null {
  try {
    return localStorage.getItem(`dead-sector:${key}`);
  } catch {
    return null;
  }
}

function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(`dead-sector:${key}`, value);
  } catch {
    /* settings are a convenience; private mode simply keeps defaults */
  }
}

export type LightingMode = 'dusk' | 'day';

export const Settings = {
  get hudScale(): number {
    const v = Number(readStored('hudScale') ?? '1');
    return v >= 1 && v <= 1.5 ? v : 1;
  },
  set hudScale(v: number) {
    writeStored('hudScale', String(v));
    document.documentElement.style.setProperty('--hud-scale', String(v));
  },
  /** Master volume 0..1. */
  get volume(): number {
    const v = Number(readStored('volume') ?? '0.8');
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : 0.8;
  },
  set volume(v: number) {
    writeStored('volume', String(Math.max(0, Math.min(1, v))));
  },
  get muted(): boolean {
    return readStored('muted') === '1';
  },
  set muted(v: boolean) {
    writeStored('muted', v ? '1' : '0');
  },
  /** Stylized blood decals and particles (spec 14: configurable intensity). */
  get blood(): boolean {
    return readStored('blood') !== '0';
  },
  set blood(v: boolean) {
    writeStored('blood', v ? '1' : '0');
  },
  get lighting(): LightingMode {
    return readStored('lighting') === 'day' ? 'day' : 'dusk';
  },
  set lighting(v: LightingMode) {
    writeStored('lighting', v);
  },
};

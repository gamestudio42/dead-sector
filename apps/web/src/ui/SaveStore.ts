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

const unit = (key: string, fallback: number) => ({
  get(): number {
    const v = Number(readStored(key) ?? String(fallback));
    return Number.isFinite(v) && v >= 0 && v <= 1 ? v : fallback;
  },
  set(v: number): void {
    writeStored(key, String(Math.max(0, Math.min(1, v))));
  },
});
const flag = (key: string, fallback: boolean) => ({
  get(): boolean {
    const v = readStored(key);
    return v === null ? fallback : v === '1';
  },
  set(v: boolean): void {
    writeStored(key, v ? '1' : '0');
  },
});

const volume = unit('volume', 0.8);
const sfxVolume = unit('sfxVolume', 1);
const ambienceVolume = unit('ambienceVolume', 0.7);
const muted = flag('muted', false);
const blood = flag('blood', true);
const shake = flag('shake', true);
const captions = flag('captions', false);
const contrast = flag('contrast', false);
const objectivesOpen = flag('objectivesOpen', true);
const logOpen = flag('logOpen', true);
const unitsOpen = flag('unitsOpen', true);
const minimapOpen = flag('minimapOpen', true);

/** Per-viewer preferences (localStorage, falls back to defaults when unavailable). */
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
    return volume.get();
  },
  set volume(v: number) {
    volume.set(v);
  },
  get sfxVolume(): number {
    return sfxVolume.get();
  },
  set sfxVolume(v: number) {
    sfxVolume.set(v);
  },
  get ambienceVolume(): number {
    return ambienceVolume.get();
  },
  set ambienceVolume(v: number) {
    ambienceVolume.set(v);
  },
  get muted(): boolean {
    return muted.get();
  },
  set muted(v: boolean) {
    muted.set(v);
  },
  /** Stylized blood decals and particles (spec 14: configurable intensity). */
  get blood(): boolean {
    return blood.get();
  },
  set blood(v: boolean) {
    blood.set(v);
  },
  get lighting(): LightingMode {
    return readStored('lighting') === 'day' ? 'day' : 'dusk';
  },
  set lighting(v: LightingMode) {
    writeStored('lighting', v);
  },
  /** Camera shake and damage vignette (off = reduced motion). */
  get shake(): boolean {
    return shake.get();
  },
  set shake(v: boolean) {
    shake.set(v);
  },
  /** On-screen captions for important sounds (spec 13.3). */
  get captions(): boolean {
    return captions.get();
  },
  set captions(v: boolean) {
    captions.set(v);
  },
  /** High-contrast HUD (stronger panels, larger status text, shape-coded markers). */
  get contrast(): boolean {
    return contrast.get();
  },
  set contrast(v: boolean) {
    contrast.set(v);
    applyContrast();
  },
  get objectivesOpen(): boolean {
    return objectivesOpen.get();
  },
  set objectivesOpen(v: boolean) {
    objectivesOpen.set(v);
  },
  get logOpen(): boolean {
    return logOpen.get();
  },
  set logOpen(v: boolean) {
    logOpen.set(v);
  },
  get unitsOpen(): boolean {
    return unitsOpen.get();
  },
  set unitsOpen(v: boolean) {
    unitsOpen.set(v);
  },
  get minimapOpen(): boolean {
    return minimapOpen.get();
  },
  set minimapOpen(v: boolean) {
    minimapOpen.set(v);
  },
};

/** Applies document-level presentation settings (HUD scale, contrast). */
export function applyContrast(): void {
  document.documentElement.classList.toggle('high-contrast', Settings.contrast);
  document.documentElement.style.setProperty('--hud-scale', String(Settings.hudScale));
}

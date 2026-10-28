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

export const Settings = {
  get hudScale(): number {
    const v = Number(localStorage.getItem('dead-sector:hudScale') ?? '1');
    return v >= 1 && v <= 1.5 ? v : 1;
  },
  set hudScale(v: number) {
    localStorage.setItem('dead-sector:hudScale', String(v));
    document.documentElement.style.setProperty('--hud-scale', String(v));
  },
};

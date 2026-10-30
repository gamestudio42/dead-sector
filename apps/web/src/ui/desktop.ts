/** Bridge from the Electron preload (apps/desktop); null in the browser. */
export const desktop =
  (window as unknown as { deadSectorDesktop?: { quit(): void } }).deadSectorDesktop ?? null;

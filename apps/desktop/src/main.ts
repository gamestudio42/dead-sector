import { app, BrowserWindow, ipcMain, Menu, net, protocol, shell } from 'electron';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

/**
 * Desktop shell: serves the built web game from `app://game/` in a sandboxed window with a minimal
 * preload. The fixed origin keeps saves and settings in place across versions; everything works
 * offline. `--smoke` and `--bench` drive a real mission and report on stdout.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const GAME_DIR = path.join(here, '..', 'game');
const ORIGIN = 'app://game';
const smoke = process.argv.includes('--smoke');
const bench = process.argv.includes('--bench');

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
};

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'app',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
]);

async function serve(req: Request): Promise<Response> {
  const url = new URL(req.url);
  if (url.host !== 'game') return new Response('Not found', { status: 404 });
  const rel = decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname);
  const file = path.normalize(path.join(GAME_DIR, rel));
  if (!file.startsWith(GAME_DIR + path.sep)) return new Response('Not found', { status: 404 });
  const res = await net.fetch(pathToFileURL(file).toString()).catch(() => null);
  if (!res?.ok) return new Response('Not found', { status: 404 });
  return new Response(res.body, {
    status: 200,
    headers: {
      'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream',
      'Content-Security-Policy':
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' data: blob:",
    },
  });
}

function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#0d0e10',
    title: 'Dead Sector',
    show: !smoke,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(here, '..', 'preload.cjs'),
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      devTools: !app.isPackaged,
    },
  });
  // Stay inside the game: external links open in the browser, nothing else navigates.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://')) void shell.openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith(ORIGIN)) e.preventDefault();
  });
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    }
  });
  void win.loadURL(`${ORIGIN}/index.html`);
  return win;
}

/** Polls a page expression until it is truthy; returns its value, or null on timeout. */
async function until<T>(win: BrowserWindow, expr: string, ms = 60_000): Promise<T | null> {
  const deadline = Date.now() + ms;
  while (Date.now() < deadline) {
    const r = (await win.webContents.executeJavaScript(expr).catch(() => null)) as T | null;
    if (r) return r;
    await new Promise((res) => setTimeout(res, 250));
  }
  return null;
}

const clickWhenReady = (win: BrowserWindow, testId: string): Promise<boolean | null> =>
  until<boolean>(
    win,
    `(() => { const b = document.querySelector('[data-testid="${testId}"]'); if (!b) return false; b.click(); return true; })()`,
  );

/** Goes from the title screen into a mission and waits until the simulation hook is up. */
async function enterMission(win: BrowserWindow): Promise<boolean> {
  return !!(
    (await clickWhenReady(win, 'btn-new-mission')) &&
    (await clickWhenReady(win, 'pick-a-ultima-farmacia')) &&
    (await clickWhenReady(win, 'btn-deploy')) &&
    (await until(win, '!!window.__DEAD_SECTOR__'))
  );
}

/** `--smoke`: hidden window, plays into a mission, checks the simulation runs and storage works. */
async function runSmoke(win: BrowserWindow): Promise<void> {
  const errors: string[] = [];
  win.webContents.on('console-message', (e) => {
    if (e.level === 'error') errors.push(e.message);
  });
  const entered = await enterMission(win);
  const tick = entered
    ? await until<number>(win, 'window.__DEAD_SECTOR__.tick() > 5 && window.__DEAD_SECTOR__.tick()')
    : null;
  const result = await win.webContents
    .executeJavaScript(
      `({ href: location.href, storage: (localStorage.setItem('dead-sector:smoke', '1'), localStorage.getItem('dead-sector:smoke') === '1'), desktop: !!window.deadSectorDesktop })`,
    )
    .catch(() => null);
  const ready = entered && !!tick && !!result?.storage && !!result?.desktop && !errors.length;
  console.log(`SMOKE ${JSON.stringify({ ready, tick, errors, ...result })}`);
  app.exit(ready ? 0 : 1);
}

/** `--bench`: visible window (real GPU, no throttling); frame times per graphics quality. */
async function runBench(win: BrowserWindow): Promise<void> {
  for (const quality of ['high', 'medium', 'low']) {
    await win.webContents.executeJavaScript(
      `localStorage.setItem('dead-sector:quality', '${quality}')`,
    );
    const loaded = new Promise<void>((res) => win.webContents.once('did-finish-load', () => res()));
    win.webContents.reload();
    await loaded;
    if (!(await enterMission(win))) {
      console.log('BENCH timeout');
      app.exit(1);
      return;
    }
    const sample = await win.webContents.executeJavaScript(`new Promise((done) => {
      window.__DEAD_SECTOR__.startPlan('combat');
      const gl = document.createElement('canvas').getContext('webgl');
      const info = gl && gl.getExtension('WEBGL_debug_renderer_info');
      const renderer = info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : 'unknown';
      const frames = [];
      const warmupUntil = performance.now() + 3000;
      const endAt = warmupUntil + 20000;
      let last = performance.now();
      const step = (now) => {
        if (now > warmupUntil) frames.push(now - last);
        last = now;
        if (now < endAt) return requestAnimationFrame(step);
        frames.sort((a, b) => a - b);
        const avg = frames.reduce((a, b) => a + b, 0) / frames.length;
        done({
          renderer,
          size: innerWidth + 'x' + innerHeight,
          fps: Math.round(1000 / avg),
          p99ms: Math.round(frames[Math.floor(frames.length * 0.99)]),
        });
      };
      requestAnimationFrame(step);
    })`);
    console.log(`BENCH ${JSON.stringify({ quality, ...sample })}`);
  }
  app.exit(0);
}

void app.whenReady().then(async () => {
  Menu.setApplicationMenu(null);
  ipcMain.on('dead-sector:quit', () => app.quit());
  protocol.handle('app', serve);
  const win = createWindow();
  if (smoke) await runSmoke(win);
  else if (bench) await runBench(win);
});

app.on('window-all-closed', () => app.quit());

// Gameplay footage for the trailer: each shot is a numbered JPEG sequence at 30 fps, stepped by
// hand from the real game on its scripted routes. tools/promo/trailer.mjs cuts them together.
// Run: pnpm --filter @dead-sector/game exec playwright test -c promo/playwright.config.ts trailer
import { test, type Page } from '@playwright/test';
import { mkdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const OUT = path.join(homedir(), 'assets', '_staging', 'dead-sector', 'trailer', 'footage');
test.use({ viewport: { width: 1920, height: 1080 } });

async function open(page: Page, id: string, hud: boolean): Promise<void> {
  await page.addInitScript(() => localStorage.setItem('dead-sector:tips', '0'));
  await page.goto('/?lang=pt-BR');
  await page.getByTestId('btn-new-mission').click();
  await page.getByTestId(`pick-${id}`).click();
  await page.getByTestId('btn-deploy').click();
  await page.waitForFunction(() => !!(window as any).__DEAD_SECTOR__);
  await page.evaluate((show) => {
    if (!show) (document.getElementById('ui') as HTMLElement).style.display = 'none';
    const g = (window as any).__PHASER_GAME__;
    g.loop.sleep();
    let t = g.loop.now;
    const w = window as any;
    w.__step = (n: number) => {
      for (let i = 0; i < n; i++) g.step((t += 1000 / 30), 1000 / 30);
    };
    w.__cam = g.scene.getScene('Tactical').cameras.main;
  }, hud);
}

/** Moves the camera a fraction of the way to a target each frame, so following never jitters. */
const FOLLOW = `(function (x, y) {
  const c = window.__cam, k = 0.12;
  const cx = c.midPoint.x + (x * 16 - c.midPoint.x) * k, cy = c.midPoint.y + (y * 16 - c.midPoint.y) * k;
  c.centerOn(cx, cy);
})`;

async function record(page: Page, shot: string, frames: number, target: string, zoom: number) {
  const dir = path.join(OUT, shot);
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  await page.evaluate(
    ({ target, zoom, follow }) => {
      const w = window as any;
      w.__cam.setZoom(zoom);
      w.__target = new Function('h', `return ${target}`);
      w.__follow = eval(follow);
      const p = w.__target(w.__DEAD_SECTOR__);
      w.__cam.centerOn(p.x * 16, p.y * 16);
    },
    { target, zoom, follow: FOLLOW },
  );
  for (let i = 0; i < frames; i++) {
    await page.evaluate(() => {
      const w = window as any;
      const p = w.__target(w.__DEAD_SECTOR__);
      w.__follow(p.x, p.y);
      w.__step(1);
    });
    await page.screenshot({
      path: path.join(dir, `f_${String(i).padStart(5, '0')}.jpg`),
      type: 'jpeg',
      quality: 88,
    });
  }
}

/** Steps (without capturing) until a predicate on the game hook holds. */
async function skipUntil(page: Page, predicate: string, max = 20000) {
  await page.evaluate(
    ({ predicate, max }) => {
      const w = window as any;
      const ok = new Function('h', `return ${predicate}`);
      for (let i = 0; i < max && !ok(w.__DEAD_SECTOR__); i++) w.__step(1);
    },
    { predicate, max },
  );
}

const ALFA = `(() => { const a = h.state().survivors.find((s) => s.alive && s.squadId === 'alfa'); return a ? { x: a.position.x + 3, y: a.position.y + 2 } : { x: 20, y: 10 }; })()`;

test('sneak', async ({ page }) => {
  await open(page, 'a-ultima-farmacia', true);
  await page.evaluate(() => (window as any).__DEAD_SECTOR__.startPlan('stealth'));
  await skipUntil(page, 'h.tick() > 60');
  await record(page, 'sneak', 150, ALFA, 2.2);
});

test('firefight and horde', async ({ page }) => {
  await open(page, 'a-ultima-farmacia', true);
  await page.evaluate(() => (window as any).__DEAD_SECTOR__.startPlan('combat'));
  await skipUntil(page, "h.eventCount('SHOT_FIRED') >= 1");
  await record(page, 'fight', 210, ALFA, 2.6);
  await skipUntil(page, "h.eventCount('HORDE_INCOMING') >= 1");
  await record(page, 'horde', 120, ALFA, 1.9);
});

test('night fire', async ({ page }) => {
  await open(page, 'plantao-noturno', false);
  await page.evaluate(() => (window as any).__DEAD_SECTOR__.startPlan('mission'));
  // until the squad stands near a burning wreck it has already seen
  await skipUntil(
    page,
    `(() => {
      const sc = window.__PHASER_GAME__.scene.getScene('Tactical');
      const fires = sc.children.list.filter((o) => o.texture && o.texture.key === 'fx-sheet-wreck_fire' && o.visible);
      const a = h.state().survivors.find((s) => s.alive && s.squadId === 'alfa');
      if (!a) return false;
      const f = fires.find((o) => Math.hypot(o.x / 16 - a.position.x, o.y / 16 - a.position.y) < 9);
      if (f) window.__fire = { x: f.x / 16, y: f.y / 16 };
      return !!f;
    })()`,
  );
  const between = `(() => { const a = h.state().survivors.find((s) => s.alive && s.squadId === 'alfa'); const f = window.__fire; return a ? { x: (a.position.x + f.x) / 2, y: (a.position.y + f.y) / 2 } : f; })()`;
  await record(page, 'night', 120, between, 2.4);
});

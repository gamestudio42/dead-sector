// Store and README screenshots, taken from the real game with its deterministic scripted routes.
// Run: pnpm --filter @dead-sector/game exec playwright test -c promo/playwright.config.ts shots
import { test, type Page } from '@playwright/test';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../../../docs/screenshots/', import.meta.url));

/** Stops Phaser's own loop and advances the game by hand at 30 fps, so captures do not depend on speed. */
async function manualClock(page: Page): Promise<void> {
  await page.evaluate(() => {
    const g = (window as any).__PHASER_GAME__;
    g.loop.sleep();
    let t = g.loop.now;
    (window as any).__step = (frames: number) => {
      for (let i = 0; i < frames; i++) {
        t += 1000 / 30;
        g.step(t, 1000 / 30);
      }
    };
  });
}
const step = (page: Page, frames: number) =>
  page.evaluate((n) => (window as any).__step(n), frames);

async function mission(page: Page, id: string): Promise<void> {
  // no tutorial hints over the frame
  await page.addInitScript(() => localStorage.setItem('dead-sector:tips', '0'));
  await page.goto('/?lang=pt-BR');
  await page.getByTestId('btn-new-mission').click();
  await page.getByTestId(`pick-${id}`).click();
  await page.getByTestId('btn-deploy').click();
  await page.waitForFunction(() => !!(window as any).__DEAD_SECTOR__);
}

const zoom = (page: Page, z: number) =>
  page.evaluate(
    (v) => (window as any).__PHASER_GAME__.scene.getScene('Tactical').cameras.main.setZoom(v),
    z,
  );

/** Steps the game until `count` more `event`s happened with `follow` on screen; returns false on timeout. */
async function until(page: Page, event: string, count: number, follow: string, frames = 3000) {
  return page.evaluate(
    ({ event, count, follow, frames }) => {
      const h = (window as any).__DEAD_SECTOR__;
      const target = h.eventCount(event) + count;
      for (let i = 0; i < frames; i++) {
        const a = h.state().survivors.find((s: any) => s.alive && s.squadId === follow);
        if (a) h.centerOn(a.position.x + 3, a.position.y + 2);
        (window as any).__step(1);
        if (h.eventCount(event) >= target) return true;
      }
      return false;
    },
    { event, count, follow, frames },
  );
}

const CANDIDATES = process.env['PROMO_CANDIDATES'];
const shot = (page: Page, name: string) =>
  page.screenshot({ path: `${CANDIDATES ?? OUT}${name}.jpg`, type: 'jpeg', quality: 90 });

test('firefight at dusk', async ({ page }) => {
  await mission(page, 'a-ultima-farmacia');
  await page.evaluate(() => (window as any).__DEAD_SECTOR__.startPlan('combat'));
  await manualClock(page);
  await zoom(page, 2.8);
  // skip the walk to the first contact, then catch shots a couple of frames into their flash
  await until(page, 'SHOT_FIRED', 1, 'alfa', 6000);
  for (let n = 0; n < (CANDIDATES ? 6 : 1); n++) {
    await until(page, 'SHOT_FIRED', 3, 'alfa');
    await step(page, 2);
    await shot(page, CANDIDATES ? `battle-${n}` : 'battle');
  }
});

// The plate under the store cover and the studio site card: the same fight with the HUD hidden.
test('cover plate', async ({ page }) => {
  await mission(page, 'a-ultima-farmacia');
  await page.evaluate(() => (window as any).__DEAD_SECTOR__.startPlan('combat'));
  await manualClock(page);
  await zoom(page, 2.4);
  await page.evaluate(
    () => ((document.getElementById('ui') as HTMLElement).style.display = 'none'),
  );
  await until(page, 'SHOT_FIRED', 1, 'alfa', 6000);
  for (let n = 0; n < (CANDIDATES ? 6 : 1); n++) {
    await until(page, 'SHOT_FIRED', 4, 'alfa');
    await step(page, 2);
    await page.screenshot({
      path: `${CANDIDATES ?? OUT}cover-plate${CANDIDATES ? `-${n}` : ''}.png`,
    });
  }
});

// Title screen over the moving backdrop of the Bairro da Ferrugem.
test('menu', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dead-sector:tips', '0'));
  await page.goto('/?lang=pt-BR');
  await page.getByTestId('menu').waitFor();
  await manualClock(page);
  // let the infected on the backdrop walk into their stride
  await step(page, 150);
  await shot(page, 'menu');
});

// Night in the Centro Velho: the squads' lanterns are the only light when the first shots ring out.
test('night', async ({ page }) => {
  await mission(page, 'plantao-noturno');
  await page.evaluate(() => (window as any).__DEAD_SECTOR__.startPlan('mission'));
  await manualClock(page);
  await zoom(page, 2.6);
  await until(page, 'SHOT_FIRED', 1, 'alfa', 9000);
  for (let n = 0; n < (CANDIDATES ? 6 : 1); n++) {
    await until(page, 'SHOT_FIRED', 2, 'alfa');
    await step(page, 2);
    await shot(page, CANDIDATES ? `night-${n}` : 'night');
  }
});

// Briefing of Sinal Fraco: map, objectives and intel over the dimmed title backdrop.
test('briefing', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('dead-sector:tips', '0'));
  await page.goto('/?lang=pt-BR');
  await page.getByTestId('btn-new-mission').click();
  await page.getByTestId('pick-sinal-fraco').click();
  await page.getByTestId('briefing').waitFor();
  await page.waitForTimeout(600);
  await shot(page, 'briefing');
});

// Two squads paused at the start, each with a move and three Shift-click waypoints queued.
test('orders', async ({ page }) => {
  await mission(page, 'a-ultima-farmacia');
  const hook = <T>(fn: string) =>
    page.evaluate(`(h => ${fn})(window.__DEAD_SECTOR__)`) as Promise<T>;
  await page.keyboard.press('Space');
  await page.getByTestId('paused-flag').waitFor();
  await hook('h.centerOn(18, 9)');
  await page.waitForTimeout(200);
  const at = (x: number, y: number) =>
    hook<{ x: number; y: number }>(`h.worldToScreen(${x}, ${y})`);
  // drag a box around both squads, starting clear of the left HUD
  const a = await at(5.4, 3);
  const b = await at(19, 9);
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  const route: [number, number][] = [
    [20.5, 8.5],
    [25.5, 9.5],
    [27.5, 14.5],
    [24.5, 18.5],
  ];
  for (const [i, [x, y]] of route.entries()) {
    const p = await at(x, y);
    if (i > 0) await page.keyboard.down('Shift');
    await page.mouse.click(p.x, p.y, { button: 'right' });
    if (i > 0) await page.keyboard.up('Shift');
  }
  // orders given while paused apply on the next tick: step one (the clock still reads 00:00)
  await hook('h.fastForward(1)');
  // the squads' bark and the queue counters settle
  await page.mouse.move(800, 860);
  await page.waitForTimeout(500);
  await shot(page, 'orders');
});

// Debriefing after the scripted stealth route through A Última Farmácia.
test('debrief', async ({ page }) => {
  await mission(page, 'a-ultima-farmacia');
  await page.evaluate(() => (window as any).__DEAD_SECTOR__.startPlan('stealth'));
  for (let i = 0; i < 40; i++) {
    const done = await page.evaluate(() => {
      const h = (window as any).__DEAD_SECTOR__;
      h.fastForward(250);
      return h.state().mission.status !== 'running';
    });
    if (done) break;
  }
  await page.getByTestId('debrief').waitFor({ timeout: 30_000 });
  await page.waitForTimeout(800);
  await shot(page, 'debrief');
});

// The campaign map on day one, at the 1280×720 the trailer's still expects.
test('campaign', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.addInitScript(() => localStorage.setItem('dead-sector:tips', '0'));
  await page.goto('/?lang=pt-BR');
  await page.getByTestId('btn-campaign').click();
  await page.getByTestId('diff-normal').click();
  await page.getByTestId('strategic').waitFor();
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${CANDIDATES ?? OUT}campaign.png` });
});

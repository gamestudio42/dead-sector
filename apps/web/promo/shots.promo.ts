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

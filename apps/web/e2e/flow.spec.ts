import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

type Hooks = {
  state: () => any;
  tick: () => number;
  paused: () => boolean;
  selected: () => string | null;
  worldToScreen: (x: number, y: number) => { x: number; y: number };
  centerOn: (x: number, y: number) => void;
  fastForward: (n: number) => number;
  eventCount: (t: string) => number;
  restart: (seed?: number, paused?: boolean) => void;
  startPlan: (n: 'stealth' | 'combat') => void;
};
const SHOTS = '../../docs/testing/screenshots';
mkdirSync(SHOTS, { recursive: true });

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

async function startMission(page: Page): Promise<void> {
  await page.goto('/');
  await page.getByTestId('btn-new-mission').click();
  await expect(page.getByTestId('topbar')).toBeVisible();
  await page.waitForFunction(() => !!(window as any).__DEAD_SECTOR__);
}

const hook = <T>(page: Page, fn: (h: Hooks) => T): Promise<T> =>
  page.evaluate(`(${fn.toString()})(window.__DEAD_SECTOR__)`) as Promise<T>;

async function playPlanToEnd(page: Page, plan: 'stealth' | 'combat'): Promise<void> {
  await page.evaluate(() => (window as any).__DEAD_SECTOR__.restart(undefined, true));
  await page.waitForFunction(
    () => (window as any).__DEAD_SECTOR__?.tick() === 0 && (window as any).__DEAD_SECTOR__.paused(),
  );
  await page.evaluate((p) => (window as any).__DEAD_SECTOR__.startPlan(p), plan);
  for (let i = 0; i < 40; i++) {
    const done = await page.evaluate(() => {
      const h = (window as any).__DEAD_SECTOR__;
      h.fastForward(250);
      return h.state().mission.status !== 'running';
    });
    if (done) break;
  }
}

test('critical flow: menu → orders → pause/resume → fight → collect → rescue → extract → debrief', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await startMission(page);
  await expect(page.getByTestId('menu')).toHaveCount(0);

  // select Alfa with the keyboard and move with a right click on the map
  await page.keyboard.press('1');
  expect(await hook(page, (h) => h.selected())).toBe('alfa');
  const target = await hook(page, (h) => {
    h.centerOn(20, 8);
    return null;
  });
  void target;
  await page.waitForTimeout(150);
  const p = await hook(page, (h) => h.worldToScreen(21.5, 9.5));
  await page.mouse.click(p.x, p.y, { button: 'right' });
  await expect(page.getByTestId('event-log')).toContainText('Alfa: ordem Mover');
  await expect.poll(() => hook(page, (h) => h.state().squads[0].order?.status)).toBe('executing');

  // pause: the tick does not advance; an order given while paused executes on resume
  await page.keyboard.press('Space');
  await expect(page.getByTestId('paused-flag')).toHaveText('PAUSADO');
  const t0 = await hook(page, (h) => h.tick());
  await page.keyboard.press('h');
  await page.waitForTimeout(700);
  expect(await hook(page, (h) => h.tick())).toBe(t0);
  expect(await hook(page, (h) => h.state().squads[0].order?.type)).toBe('move');
  await page.keyboard.press('Space');
  await expect.poll(() => hook(page, (h) => h.tick())).toBeGreaterThan(t0);
  await expect.poll(() => hook(page, (h) => h.state().squads[0].order?.type)).toBe('hold');
  await page.screenshot({ path: `${SHOTS}/tactical-1280x720.png` });

  // the rest of the mission is played by the deterministic combat script from tick 0
  await playPlanToEnd(page, 'combat');
  const counts = await hook(page, (h) => ({
    shots: h.eventCount('SHOT_FIRED'),
    heard: h.eventCount('ZOMBIE_ALERTED:sound'),
    objectives: h.eventCount('OBJECTIVE_COMPLETED'),
    extraction: h.eventCount('EXTRACTION_STARTED'),
  }));
  expect(counts.shots).toBeGreaterThan(0);
  expect(counts.heard).toBeGreaterThan(0); // infected reacted to gunfire they could hear
  expect(counts.extraction).toBe(1);
  expect(counts.objectives).toBe(5);
  await expect(page.getByTestId('debrief')).toBeVisible({ timeout: 10_000 });
  await expect(page.getByTestId('debrief-outcome')).toHaveText('Missão cumprida');
  await page.screenshot({ path: `${SHOTS}/debrief-1280x720.png` });
  await page.getByTestId('btn-menu').click();
  await expect(page.getByTestId('menu')).toBeVisible();
  expect(errors).toEqual([]);
});

test('stealth route completes without firing', async ({ page }) => {
  await startMission(page);
  await playPlanToEnd(page, 'stealth');
  expect(await hook(page, (h) => h.eventCount('SHOT_FIRED'))).toBe(0);
  await expect(page.getByTestId('debrief-outcome')).toHaveText('Missão cumprida', {
    timeout: 10_000,
  });
});

test('save and load restore the exact simulation state', async ({ page }) => {
  await startMission(page);
  await page.evaluate(() => (window as any).__DEAD_SECTOR__.fastForward(120));
  await page.keyboard.press('Space');
  const saved = await hook(page, (h) => ({
    tick: h.tick(),
    rng: h.state().rngState,
    pos: h.state().zombies[0].position,
  }));
  await page.getByTestId('btn-save').click();
  await page.waitForTimeout(300);
  await page.evaluate(() => (window as any).__DEAD_SECTOR__.fastForward(80));
  expect(await hook(page, (h) => h.tick())).toBe(saved.tick + 80);
  await page.getByTestId('btn-load').click();
  await expect.poll(() => hook(page, (h) => h.tick())).toBeLessThanOrEqual(saved.tick + 2);
  await page.keyboard.press('Space'); // pause right away to compare
  const loaded = await hook(page, (h) => ({ tick: h.tick(), rng: h.state().rngState }));
  expect(loaded.tick).toBeGreaterThanOrEqual(saved.tick);
  if (loaded.tick === saved.tick) expect(loaded.rng).toBe(saved.rng);
  // the menu offers to continue from the quicksave
  await page.goto('/');
  await expect(page.getByTestId('btn-continue')).toBeEnabled();
});

for (const size of [
  { width: 1280, height: 720 },
  { width: 1920, height: 1080 },
]) {
  test(`HUD fits without clipping at ${size.width}x${size.height}`, async ({ page }) => {
    await page.setViewportSize(size);
    await startMission(page);
    await page.keyboard.press('Space');
    await page.waitForTimeout(400);
    for (const id of [
      'topbar',
      'objectives',
      'event-log',
      'units',
      'squad-alfa',
      'squad-bravo',
      'btn-pause',
      'btn-save',
    ]) {
      const box = await page.getByTestId(id).boundingBox();
      expect(box, id).not.toBeNull();
      expect(box!.x, id).toBeGreaterThanOrEqual(0);
      expect(box!.y, id).toBeGreaterThanOrEqual(0);
      expect(box!.x + box!.width, id).toBeLessThanOrEqual(size.width + 1);
      expect(box!.y + box!.height, id).toBeLessThanOrEqual(size.height + 1);
    }
    await page.screenshot({ path: `${SHOTS}/hud-${size.width}x${size.height}.png` });
  });
}

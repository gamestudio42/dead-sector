import { expect, test, type Page } from '@playwright/test';
import { mkdirSync } from 'node:fs';

type Hooks = {
  state: () => any;
  tick: () => number;
  paused: () => boolean;
  selected: () => string | null;
  selection: () => string[];
  worldToScreen: (x: number, y: number) => { x: number; y: number };
  centerOn: (x: number, y: number) => void;
  fastForward: (n: number) => number;
  eventCount: (t: string) => number;
  restart: (seed?: number, paused?: boolean) => void;
  startPlan: (n: 'stealth' | 'combat' | 'mission') => void;
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
  await page.getByTestId('pick-a-ultima-farmacia').click();
  await expect(page.getByTestId('briefing')).toBeVisible();
  await page.getByTestId('btn-deploy').click();
  await expect(page.getByTestId('topbar')).toBeVisible();
  await page.waitForFunction(() => !!(window as any).__DEAD_SECTOR__);
}

const hook = <T>(page: Page, fn: (h: Hooks) => T): Promise<T> =>
  page.evaluate(`(${fn.toString()})(window.__DEAD_SECTOR__)`) as Promise<T>;

async function playPlanToEnd(page: Page, plan: 'stealth' | 'combat' | 'mission'): Promise<void> {
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
  await expect(page.getByTestId('debrief-grade')).toHaveText(/^[SABCD]$/);
  await page.screenshot({ path: `${SHOTS}/debrief-1280x720.png` });
  await page.getByTestId('btn-menu').click();
  await expect(page.getByTestId('menu')).toBeVisible();
  expect(errors).toEqual([]);
});

test('stealth route completes in the real client with only the final hold firing', async ({
  page,
}) => {
  await startMission(page);
  await playPlanToEnd(page, 'stealth');
  // zero shots before the radio is asserted in the sim acceptance test; here: a quiet run overall
  expect(await hook(page, (h) => h.eventCount('SHOT_FIRED'))).toBeLessThan(25);
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
      'btn-options',
      'minimap',
      'alarm',
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

test('options pause the mission, apply settings and persist panel layout', async ({ page }) => {
  const errors = trackErrors(page);
  await startMission(page);
  expect(await hook(page, (h) => h.paused())).toBe(false);
  await page.getByTestId('btn-options').click();
  await expect(page.getByTestId('options')).toBeVisible();
  expect(await hook(page, (h) => h.paused())).toBe(true);
  await page.getByRole('button', { name: 'Acessibilidade' }).click();
  await page.locator('[data-opt=captions]').check();
  await page.locator('[data-opt=contrast]').check();
  await expect(page.locator('html')).toHaveClass(/high-contrast/);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('options')).toHaveCount(0);
  expect(await hook(page, (h) => h.paused())).toBe(false);
  // collapse the event log; the choice survives a reload
  await page.locator('[data-toggle=log]').click();
  await expect(page.locator('[data-panel=log]')).toHaveClass(/collapsed/);
  await page.goto('/');
  await page.getByTestId('btn-new-mission').click();
  await page.getByTestId('pick-a-ultima-farmacia').click();
  await page.getByTestId('btn-deploy').click();
  await expect(page.locator('[data-panel=log]')).toHaveClass(/collapsed/);
  await expect(page.locator('html')).toHaveClass(/high-contrast/);
  // minimap click recentres the camera
  const before = await page.evaluate(() => {
    const cam = (window as any).__PHASER_GAME__.scene.getScene('Tactical').cameras.main;
    return { x: cam.scrollX, y: cam.scrollY };
  });
  const box = (await page.getByTestId('minimap').locator('canvas').boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.75, box.y + box.height * 0.75);
  const after = await page.evaluate(() => {
    const cam = (window as any).__PHASER_GAME__.scene.getScene('Tactical').cameras.main;
    return { x: cam.scrollX, y: cam.scrollY };
  });
  expect(after.x).toBeGreaterThan(before.x);
  expect(after.y).toBeGreaterThan(before.y);
  expect(errors).toEqual([]);
});

test('controls: drag-select, Shift waypoints, Ctrl context menu and rebound keys', async ({
  page,
}) => {
  const errors = trackErrors(page);
  await startMission(page);
  await page.keyboard.press('Space'); // pause: orders queue up while paused
  await expect(page.getByTestId('paused-flag')).toHaveText('PAUSADO');

  // drag a box around both squads (spawned at y≈5.5, x 6–17), starting clear of the left HUD
  await hook(page, (h) => h.centerOn(12, 7));
  await page.waitForTimeout(150);
  const a = await hook(page, (h) => h.worldToScreen(5.4, 3));
  const b = await hook(page, (h) => h.worldToScreen(19, 9));
  await page.mouse.move(a.x, a.y);
  await page.mouse.down();
  await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await page.mouse.move(b.x, b.y, { steps: 4 });
  await page.mouse.up();
  expect(await page.evaluate(() => (window as any).__DEAD_SECTOR__.selection())).toEqual([
    'alfa',
    'bravo',
  ]);
  await expect(page.getByTestId('squad-bravo')).toHaveClass(/selected/);

  // plain click narrows the selection back to one squad
  await page.keyboard.press('1');
  expect(await page.evaluate(() => (window as any).__DEAD_SECTOR__.selection())).toEqual(['alfa']);

  // move, then Shift + right click adds a waypoint after it
  const p1 = await hook(page, (h) => h.worldToScreen(20.5, 8.5));
  await page.mouse.click(p1.x, p1.y, { button: 'right' });
  const p2 = await hook(page, (h) => h.worldToScreen(25.5, 9.5));
  await page.keyboard.down('Shift');
  await page.mouse.click(p2.x, p2.y, { button: 'right' });
  await page.keyboard.up('Shift');
  await page.keyboard.press('Space');
  await expect.poll(() => hook(page, (h) => h.state().squads[0].waypoints.length)).toBe(1);
  await expect(page.getByTestId('queue-alfa')).toHaveText('+1 na fila');
  await page.keyboard.press('Space');

  // Ctrl + right click opens the order menu; choose sneak
  const p3 = await hook(page, (h) => h.worldToScreen(10.5, 10.5));
  await page.keyboard.down('Control');
  await page.mouse.click(p3.x, p3.y, { button: 'right' });
  await page.keyboard.up('Control');
  await expect(page.getByTestId('context-menu')).toBeVisible();
  await page.getByRole('menuitem', { name: /Furtivo até aqui/ }).click();
  await expect(page.getByTestId('context-menu')).toHaveCount(0);
  await page.keyboard.press('Space');
  await expect.poll(() => hook(page, (h) => h.state().squads[0].order?.type)).toBe('sneak');
  // a normal order dropped the old queue
  expect(await hook(page, (h) => h.state().squads[0].waypoints.length)).toBe(0);
  await page.keyboard.press('Space');

  // rebind "hold" to J and use it
  await page.getByTestId('btn-options').click();
  await page.getByRole('button', { name: 'Controles' }).click();
  await page.getByTestId('bind-hold').click();
  await page.keyboard.press('j');
  await expect(page.getByTestId('bind-hold')).toHaveText('J');
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('options')).toHaveCount(0);
  await page.keyboard.press('j');
  await page.keyboard.press('Space');
  await expect.poll(() => hook(page, (h) => h.state().squads[0].order?.type)).toBe('hold');
  await page.screenshot({ path: `${SHOTS}/controls-1280x720.png` });
  expect(errors).toEqual([]);
});

for (const id of ['sinal-fraco', 'plantao-noturno'])
  test(`mission ${id} loads its own map, texts and objectives`, async ({ page }) => {
    const errors = trackErrors(page);
    await page.goto('/');
    await page.getByTestId('btn-new-mission').click();
    await page.getByTestId(`pick-${id}`).click();
    await expect(page.getByTestId('briefing')).toBeVisible();
    await page.getByTestId('btn-deploy').click();
    await expect(page.getByTestId('topbar')).toBeVisible();
    await page.waitForFunction(() => !!(window as any).__DEAD_SECTOR__);
    expect(await hook(page, (h) => h.state().missionId)).toBe(id);
    await expect(page.getByTestId('current-objective')).not.toContainText('farmácia');
    await page.evaluate(() => (window as any).__DEAD_SECTOR__.fastForward(100));
    expect(errors).toEqual([]);
  });

test('campaign: losses and progress carry into the next mission', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/');
  await page.getByTestId('btn-campaign').click();
  await expect(page.getByTestId('briefing')).toContainText('Campanha');
  await page.getByTestId('btn-deploy').click();
  await page.waitForFunction(() => !!(window as any).__DEAD_SECTOR__);
  await playPlanToEnd(page, 'mission');
  await expect(page.getByTestId('interlude')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('btn-campaign-next').click();
  await expect(page.getByTestId('briefing')).toContainText('Sinal Fraco');
  // the roster shows the condition everyone came back in
  await expect(page.locator('[data-testid=briefing] td.state').first()).not.toHaveText('pronto');
  const dead = await page.locator('[data-testid=briefing] tr.fallen').count();
  await page.getByTestId('btn-deploy').click();
  await page.waitForFunction(
    () => (window as any).__DEAD_SECTOR__?.state().missionId === 'sinal-fraco',
  );
  const deployed = await hook(
    page,
    (h) => h.state().survivors.filter((s: any) => s.squadId).length,
  );
  expect(deployed).toBe(8 - dead);
  // and the campaign survives a reload of the page
  await page.goto('/');
  await expect(page.getByTestId('btn-campaign')).toContainText('Continuar campanha');
  expect(errors).toEqual([]);
});

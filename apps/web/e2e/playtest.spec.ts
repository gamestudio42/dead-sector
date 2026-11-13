import { expect, test, type Page } from '@playwright/test';

type Entry = { kind: string; [k: string]: any };

const log = (page: Page): Promise<Entry[]> =>
  page.evaluate(() => JSON.parse(localStorage.getItem('dead-sector:playtestLog') ?? '[]'));

async function deploy(page: Page): Promise<void> {
  await page.getByTestId('btn-new-mission').click();
  await page.getByTestId('pick-a-ultima-farmacia').click();
  await expect(page.getByTestId('briefing')).toBeVisible();
  await page.getByTestId('btn-deploy').click();
  await expect(page.getByTestId('topbar')).toBeVisible();
  await page.waitForFunction(() => !!(window as any).__DEAD_SECTOR__);
}

test('playtest log: off by default, on from the link, records a mission, its end and an abandon', async ({
  page,
}) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));

  // off by default: playing records nothing
  await page.goto('/?lang=pt-BR');
  await expect(page.getByTestId('btn-campaign')).toBeVisible();
  expect(await log(page)).toEqual([]);

  // the tester's link turns it on
  await page.goto('/?lang=pt-BR&playtest=1');
  await deploy(page);
  await page.evaluate(() => (window as any).__DEAD_SECTOR__.startPlan('mission'));
  for (let i = 0; i < 40; i++) {
    const done = await page.evaluate(() => {
      const h = (window as any).__DEAD_SECTOR__;
      h.fastForward(250);
      return h.state().mission.status !== 'running';
    });
    if (done) break;
  }
  await expect(page.getByTestId('debrief')).toBeVisible({ timeout: 15_000 });
  await page.getByTestId('btn-menu').click();

  let entries = await log(page);
  const kinds = entries.map((e) => e.kind);
  for (const k of [
    'session',
    'menu',
    'briefing',
    'missionStart',
    'objective',
    'sample',
    'missionEnd',
    'debrief',
  ])
    expect(kinds).toContain(k);
  const end = entries.find((e) => e.kind === 'missionEnd')!;
  expect(['success', 'partial', 'failed']).toContain(end.status);
  expect(end.input.pauses).toBeGreaterThanOrEqual(0);
  expect(entries.find((e) => e.kind === 'debriefChoice')?.choice).toBe('menu');

  // leaving a mission early is recorded with how
  await deploy(page);
  await page.evaluate(() => (window as any).__DEAD_SECTOR__.fastForward(100));
  await page.keyboard.press('Escape');
  await page.locator('.overlay-menu [data-a=menu]').click();
  // the scene closes on the next frame
  await expect
    .poll(async () => (await log(page)).some((e) => e.kind === 'missionAbandon'))
    .toBe(true);
  entries = await log(page);
  const left = entries.filter((e) => e.kind === 'missionAbandon').at(-1)!;
  expect(left.how).toBe('menu');
  expect(left.tick).toBeGreaterThanOrEqual(100);

  // options: the tab shows the count and clearing needs a second click
  await page.getByTestId('btn-menu-options').click();
  await page.locator('[data-tab=playtest]').click();
  entries = await log(page); // opening Options from the menu is itself logged
  expect(entries.at(-1)?.choice).toBe('options');
  await expect(page.getByTestId('playtest-count')).toContainText(`${entries.length} `);
  const download = page.waitForEvent('download');
  await page.getByTestId('playtest-tester').fill('Ana');
  await page.getByTestId('btn-playtest-export').click();
  expect((await download).suggestedFilename()).toMatch(
    /^dead-sector-playtest-Ana-\d{4}-\d{2}-\d{2}\.json$/,
  );
  await page.getByTestId('btn-playtest-clear').click();
  expect((await log(page)).length).toBe(entries.length);
  await page.getByTestId('btn-playtest-clear').click();
  await expect(page.getByTestId('playtest-count')).toContainText('0');
  expect(errors).toEqual([]);
});

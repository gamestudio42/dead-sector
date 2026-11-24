import { expect, test, type Page } from '@playwright/test';

test.use({
  viewport: { width: 360, height: 740 },
  hasTouch: true,
  isMobile: true,
});

function trackErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

async function covered(page: Page, testId: string): Promise<boolean> {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`);
    if (!el) return true;
    const r = el.getBoundingClientRect();
    const top = document.elementFromPoint(
      r.left + r.width / 2,
      Math.min(r.bottom - 2, window.innerHeight - 2),
    );
    return !top || !el.contains(top);
  }, testId);
}

test('phone portrait: mission list, briefing and rotate hint', async ({ page }) => {
  const errors = trackErrors(page);
  await page.goto('/?lang=pt-BR');
  await expect(page.getByTestId('rotate-hint')).toBeVisible();
  await page.getByTestId('btn-new-mission').click();
  const last = page.getByTestId('pick-feira-fantasma');
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  expect(await covered(page, 'pick-feira-fantasma')).toBe(false);

  await page.getByTestId('pick-a-ultima-farmacia').click();
  await expect(page.getByTestId('briefing')).toBeVisible();
  await expect(page.getByTestId('briefing')).toContainText('toque longo');
  await expect(page.getByTestId('briefing')).not.toContainText('Ctrl + clique direito ou B');
  const deploy = page.getByTestId('btn-deploy');
  await deploy.scrollIntoViewIfNeeded();
  await expect(deploy).toBeInViewport();
  expect(await covered(page, 'btn-deploy')).toBe(false);
  expect(errors.filter((e) => !e.includes('net::ERR_'))).toEqual([]);
});

test('phone landscape: the last mission can be scrolled into view', async ({ page }) => {
  await page.setViewportSize({ width: 915, height: 412 });
  await page.goto('/?lang=pt-BR');
  await expect(page.getByTestId('rotate-hint')).toBeHidden();
  await page.getByTestId('btn-new-mission').click();
  const last = page.getByTestId('pick-feira-fantasma');
  await last.scrollIntoViewIfNeeded();
  await expect(last).toBeInViewport();
  expect(await covered(page, 'pick-feira-fantasma')).toBe(false);
});

test('tablet: sector label stays inside the map and actions are 44px', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await page.goto('/?lang=pt-BR');
  await page.getByTestId('btn-credits').scrollIntoViewIfNeeded();
  expect(await covered(page, 'btn-credits')).toBe(false);
  await page.getByTestId('btn-campaign').click();
  await page.getByTestId('diff-normal').click();
  await expect(page.getByTestId('strategic')).toBeVisible();
  const menu = page.getByTestId('btn-strategic-menu');
  const endDay = page.getByTestId('btn-end-day');
  expect(await menu.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  expect(await endDay.evaluate((el) => el.getBoundingClientRect().height)).toBeGreaterThanOrEqual(
    44,
  );
  const inside = await page.evaluate(() => {
    const map = document.querySelector('[data-testid=sector-map]')!.getBoundingClientRect();
    const label = document.querySelector('[data-testid=sector-abrigo] b')!.getBoundingClientRect();
    return label.left >= map.left - 1 && label.right <= map.right + 1 && label.width > 20;
  });
  expect(inside).toBe(true);
});

import { expect, test } from '@playwright/test';

test.describe('language', () => {
  test.use({ locale: 'de-DE' });

  test('a German browser opens in German and the choice survives a reload', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Einzelmission' })).toBeVisible();

    await page.getByTestId('btn-menu-options').click();
    await page.getByTestId('locale-select').selectOption('es');
    await page.getByTestId('btn-options-close').click();

    await expect(page.getByRole('button', { name: 'Misión suelta' })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('button', { name: 'Misión suelta' })).toBeVisible();
  });
});

test('the address can force French', async ({ page }) => {
  await page.goto('/?lang=fr');
  await expect(page.getByRole('button', { name: 'Mission isolée' })).toBeVisible();
});

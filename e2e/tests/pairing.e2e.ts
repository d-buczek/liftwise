import { expect, test } from '@playwright/test';
import { fixClock, pair, visible, watchErrors } from './helpers.ts';

test('a wrong token stays on the pairing screen', async ({ page }) => {
  await fixClock(page);
  await page.goto('/calendar');
  await expect(page).toHaveURL(/\/pair/);
  await page.getByText('To pierwsze urządzenie').click();
  await page.getByLabel('Token urządzenia').fill('wrong-token');
  await page.getByRole('button', { name: 'Połącz tokenem' }).click();
  await expect(page.getByLabel('Token urządzenia')).toBeVisible();
  await expect(page).toHaveURL(/\/pair/);
});

test('the right token opens the calendar, and it survives a reload', async ({ page }) => {
  await pair(page);
  await expect(visible(page, '.lw-month__title')).toHaveText(/listopad 2026/i);
  await page.reload();
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(visible(page, '.lw-month__title')).toHaveText(/listopad 2026/i);
});

test('every screen opens without an error in the page', async ({ page }) => {
  const errors = watchErrors(page);
  await pair(page);
  for (const path of [
    '/calendar',
    '/calendar/2026-11-04',
    '/calendar/2026-11-04/workout',
    '/history',
    '/agent',
    '/agent/threads',
    '/settings',
    '/settings/equipment',
    '/settings/devices',
    '/settings/labels',
    '/settings/balance',
    '/settings/models',
    '/settings/profile',
  ]) {
    await page.goto(path);
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    await expect(
      page.locator('.ion-page:not(.ion-page-hidden) ion-title').locator('visible=true').first(),
    ).toBeVisible();
  }
  expect(errors).toEqual([]);
});

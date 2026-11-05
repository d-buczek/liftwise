import { expect, test, type Page } from '@playwright/test';
import {
  addExercise,
  BENCH,
  doneButton,
  loggedSets,
  openDay,
  pair,
  startWorkout,
  visible,
  weightButton,
  weightField,
} from './helpers.ts';

test('the wide layout has the side menu instead of tabs', async ({ page }) => {
  await pair(page);
  await expect(page.locator('ion-tab-bar')).toBeHidden();
  await page.locator('ion-menu').getByText('Historia').click();
  await expect(page).toHaveURL(/\/history$/);
});

const isDark = (page: Page) =>
  page.evaluate(() => document.documentElement.classList.contains('ion-palette-dark'));
const look = (page: Page) => page.evaluate(() => document.documentElement.dataset.theme);

test('the theme setting changes the palette and stays after a reload', async ({ page }) => {
  await pair(page);
  await page.goto('/settings');
  // A new device starts in the default look, so the first step has to tell Ciemny from it.
  await expect.poll(() => look(page)).toBe('temper');
  await page.locator('ion-radio').filter({ hasText: 'Ciemny' }).click();
  await expect.poll(() => look(page)).toBe('dark');
  await expect.poll(() => isDark(page)).toBe(true);
  await page.reload();
  await expect.poll(() => look(page)).toBe('dark');
  await page.locator('ion-radio').filter({ hasText: 'Jasny' }).click();
  await expect.poll(() => look(page)).toBe('light');
  await expect.poll(() => isDark(page)).toBe(false);
  // A theme is dark whatever was chosen before, and takes its own colors.
  await page.locator('ion-radio').filter({ hasText: 'Żeliwo' }).click();
  await expect.poll(() => look(page)).toBe('iron');
  await expect.poll(() => isDark(page)).toBe(true);
});

test('typing a weight works with the keyboard alone', async ({ page }) => {
  await pair(page);
  await openDay(page, '2026-10-12');
  await addExercise(page, BENCH);
  await startWorkout(page);
  await weightButton(page).focus();
  await page.keyboard.press('Enter');
  await expect(weightField(page)).toBeFocused();
  await page.keyboard.type('33.5');
  await page.keyboard.press('Enter');
  await expect(weightButton(page)).toBeFocused();
  await expect(weightButton(page)).toContainText('33,5');
  await doneButton(page).click();
  await expect(loggedSets(page).first()).toContainText('33,5 kg');
});

test('history lists a done workout', async ({ page }) => {
  await pair(page);
  await openDay(page, '2026-10-13');
  await addExercise(page, BENCH);
  await startWorkout(page);
  await doneButton(page).click();
  await expect(loggedSets(page)).toHaveCount(1);
  await page.goto('/history');
  await expect(visible(page, '.lw-column')).toContainText(BENCH);
});

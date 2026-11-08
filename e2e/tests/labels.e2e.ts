import { expect, test } from '@playwright/test';
import { addExercise, BENCH, openDay, pair, visible } from './helpers.ts';

test('a label set on a day shows beside its title, on the calendar and on its copy', async ({
  page,
}) => {
  await pair(page);
  await openDay(page, '2026-09-07');
  await addExercise(page, BENCH);

  await page.getByRole('button', { name: 'Dodaj etykietę' }).click();
  await page.getByRole('button', { name: 'Nowa etykieta' }).click();
  await page.getByLabel('Nazwa').fill('Push');
  await page.getByRole('button', { name: 'Zapisz' }).click();

  const chip = visible(page, 'ion-toolbar .lw-day__label');
  await expect(chip).toHaveText('Push');
  // Beside the title, in the toolbar: whole, with no clipping.
  const fits = await chip.locator('.lw-label').evaluate((el) => el.scrollWidth <= el.clientWidth);
  expect(fits).toBe(true);

  await page.goto('/calendar');
  await page.getByRole('button', { name: 'Poprzedni miesiąc' }).click();
  await page.getByRole('button', { name: 'Poprzedni miesiąc' }).click();
  const day = visible(page, '.lw-month__day[aria-label*=" 7 września"]');
  await expect(day).toContainText('Push');
  const clipped = await day
    .locator('.lw-month__label')
    .evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(clipped).toBe(false);

  // A copy keeps the label (D48).
  await openDay(page, '2026-09-14');
  await page.getByRole('button', { name: 'Kopiuj trening' }).click();
  // Pinned at the bottom: in sight without scrolling, under the month and the preview (LW-25).
  await expect(page.locator('.lw-copy__submit')).toBeInViewport({ ratio: 1 });
  // The light copy's hint wraps instead of being cut off at the toggle (LW-25).
  const lightLabelCut = await page.locator('.lw-copy__light ion-toggle').evaluate((toggle) => {
    const label = toggle.shadowRoot?.querySelector('.label-text-wrapper');
    return !label || label.scrollWidth > label.clientWidth;
  });
  expect(lightLabelCut).toBe(false);
  await page.locator('.lw-copy__submit').click();
  await expect(visible(page, 'ion-toolbar .lw-day__label')).toHaveText('Push');
  await expect(visible(page, '.lw-day__blocks')).toContainText(BENCH);
});

test('a label name is unique and can be cleared from a day', async ({ page }) => {
  await pair(page);
  await openDay(page, '2026-09-21');
  await addExercise(page, BENCH);
  await page.getByRole('button', { name: 'Dodaj etykietę' }).click();
  await page.getByRole('button', { name: 'Nowa etykieta' }).click();
  await page.getByLabel('Nazwa').fill('Pull');
  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expect(visible(page, 'ion-toolbar .lw-day__label')).toHaveText('Pull');

  await visible(page, 'ion-toolbar .lw-day__label').click();
  await page.getByRole('button', { name: 'Nowa etykieta' }).click();
  await page.getByLabel('Nazwa').fill('pull');
  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expect(page.getByText('Jest już etykieta o tej nazwie.')).toBeVisible();
  await page.getByRole('button', { name: 'Anuluj' }).last().click();

  await page.getByRole('radio', { name: 'Bez etykiety' }).click();
  await expect(page.getByRole('button', { name: 'Dodaj etykietę' })).toBeVisible();
});

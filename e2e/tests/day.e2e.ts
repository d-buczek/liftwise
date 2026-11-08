import { expect, test, type Page } from '@playwright/test';
import {
  addExercise,
  BENCH,
  doneButton,
  openDay,
  pair,
  secondDevice,
  startWorkout,
  synced,
  visible,
} from './helpers.ts';

async function removeDay(page: Page) {
  // Ionic moves the label to the button inside `ion-button`.
  await page.getByRole('button', { name: 'Akcje dnia' }).locator('visible=true').first().click();
  await page.locator('ion-action-sheet').getByRole('button', { name: 'Usuń trening' }).click();
}

const emptyDay = (page: Page) => visible(page, '.lw-day__empty');

test('"Usuń trening" empties a day, its label too, and "Cofnij" brings it back', async ({
  page,
  browser,
}) => {
  await pair(page);
  await openDay(page, '2026-10-26');
  await addExercise(page, BENCH);
  await page.getByRole('button', { name: 'Dodaj etykietę' }).click();
  await page.getByRole('button', { name: 'Nowa etykieta' }).click();
  await page.getByLabel('Nazwa').fill('Nogi');
  await page.getByRole('button', { name: 'Zapisz' }).click();
  await expect(visible(page, 'ion-toolbar .lw-day__label')).toHaveText('Nogi');

  // Planned sets only: no question, the toast offers "Cofnij".
  await removeDay(page);
  await expect(emptyDay(page)).toBeVisible();
  await expect(page.locator('ion-alert')).toHaveCount(0);
  await page.getByRole('button', { name: 'Cofnij' }).click();
  await expect(visible(page, '.lw-day__blocks')).toContainText(BENCH);
  await expect(visible(page, 'ion-toolbar .lw-day__label')).toHaveText('Nogi');

  await removeDay(page);
  await expect(emptyDay(page)).toBeVisible();
  await synced(page);

  // The other device reads an empty day from the server: no mark and no label.
  const other = await secondDevice(browser);
  await other.page.getByRole('button', { name: 'Poprzedni miesiąc' }).click();
  const day = visible(other.page, '.lw-month__day[aria-label*=" 26 października"]');
  await expect(day).toBeVisible();
  await expect(day).not.toHaveClass(/is-planned|is-done/);
  await expect(day).not.toContainText('Nogi');
  await other.context.close();
});

test('"Usuń trening" asks first when the day has done sets', async ({ page }) => {
  await pair(page);
  await openDay(page, '2026-10-27');
  await addExercise(page, BENCH);
  await startWorkout(page);
  await doneButton(page).click();
  await page.goBack();
  await expect(page).toHaveURL(/\/calendar\/2026-10-27$/);

  await removeDay(page);
  const alert = page.locator('ion-alert');
  await expect(alert).toContainText('Usunąć trening?');
  await alert.getByRole('button', { name: 'Anuluj' }).click();
  await expect(visible(page, '.lw-day__blocks')).toContainText(BENCH);
  // The page is back for screen readers: an alert opened while the sheet was closing left it hidden.
  await expect(page.locator('ion-router-outlet').first()).not.toHaveAttribute(
    'aria-hidden',
    'true',
  );

  await removeDay(page);
  await alert.getByRole('button', { name: 'Usuń trening' }).click();
  await expect(emptyDay(page)).toBeVisible();
  await page.goto('/calendar');
  await page.getByRole('button', { name: 'Poprzedni miesiąc' }).click();
  await expect(visible(page, '.lw-month__day[aria-label*=" 27 października"]')).not.toHaveClass(
    /is-planned|is-done/,
  );
});

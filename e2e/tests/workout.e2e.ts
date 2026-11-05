import { expect, test } from '@playwright/test';
import {
  addExercise,
  BENCH,
  doneButton,
  loggedSets,
  openDay,
  pair,
  secondDevice,
  startWorkout,
  synced,
  visible,
  weightButton,
  weightField,
} from './helpers.ts';

test('logging a typed weight reaches the server and another device', async ({ page, browser }) => {
  await pair(page);
  await openDay(page, '2026-10-05');
  await addExercise(page, BENCH);
  await startWorkout(page);

  // "Zrobione" with the field still open logs what was typed (§5.2, LW-17), and the field closing
  // on that press must not move the button under the finger.
  const row = page.locator('.lw-logger .lw-stepper__row').first();
  const closed = (await row.boundingBox())?.height;
  await weightButton(page).click();
  await expect(weightField(page)).toBeFocused();
  expect((await row.boundingBox())?.height).toBe(closed);
  await weightField(page).fill('22,75');
  await doneButton(page).click();
  await expect(loggedSets(page).first()).toContainText('22,75 kg');

  await synced(page);
  const second = await secondDevice(browser);
  await openDay(second.page, '2026-10-05');
  await expect(visible(second.page, '.lw-day__blocks')).toContainText('22,75');
  await second.context.close();
});

test('a weight that is no multiple of 0.25 kg never gets logged', async ({ page }) => {
  await pair(page);
  await openDay(page, '2026-10-06');
  await addExercise(page, BENCH);
  await startWorkout(page);

  await weightButton(page).click();
  await weightField(page).fill('12,3');
  await weightField(page).press('Enter');
  await expect(page.locator('.lw-logger .lw-stepper__error')).toHaveText(/wielokrotność 0,25 kg/);
  await expect(doneButton(page)).toHaveClass(/button-disabled/);
  // Even a tap that gets through while Ionic renders the state logs nothing: the planned set stays.
  const before = await loggedSets(page).allInnerTexts();
  await doneButton(page).dispatchEvent('click');
  await page.waitForTimeout(500);
  expect(await loggedSets(page).allInnerTexts()).toEqual(before);
  await expect(page.locator('.lw-logger__title')).toHaveText(/^Seria 1 /);

  // A step drops the text and counts from the last good weight.
  await page.locator('.lw-logger .lw-stepper__button').nth(1).click();
  await expect(weightField(page)).toHaveCount(0);
  await expect(doneButton(page)).not.toHaveClass(/button-disabled/);
});

test('a set can be edited and deleted, and the delete can be undone', async ({ page }) => {
  await pair(page);
  await openDay(page, '2026-10-07');
  await addExercise(page, BENCH);
  await startWorkout(page);
  await doneButton(page).click();
  await expect(loggedSets(page)).toHaveCount(1);

  // The editor: a typed weight is saved with the button, Esc leaves the sheet open.
  await loggedSets(page).first().click();
  const editor = page.locator('.lw-set-editor');
  await expect(editor).toBeVisible();
  await editor.locator('.lw-stepper__typed').first().click();
  await editor.locator('.lw-stepper__input').fill('30');
  await page.keyboard.press('Escape');
  await expect(editor).toBeVisible();
  await editor.locator('.lw-stepper__typed').first().click();
  await editor.locator('.lw-stepper__input').fill('31,25');
  await editor.locator('.lw-set-editor__save').click();
  await expect(loggedSets(page).first()).toContainText('31,25 kg');

  await loggedSets(page).first().click();
  await expect(editor).toBeVisible();
  await editor.getByRole('button', { name: 'Usuń' }).click();
  await expect(loggedSets(page)).toHaveCount(0);
  await page.getByRole('button', { name: 'Cofnij' }).click();
  await expect(loggedSets(page)).toHaveCount(1);
  await expect(loggedSets(page).first()).toContainText('31,25 kg');
});

test('the rest timer starts after a set of today and can be skipped', async ({ page }) => {
  await pair(page);
  await openDay(page, '2026-11-04');
  await addExercise(page, BENCH);
  await startWorkout(page);
  await doneButton(page).click();
  const skip = page.getByRole('button', { name: 'Pomiń' });
  await expect(skip).toBeVisible();
  await skip.click();
  await expect(skip).toHaveCount(0);
});

test('a set logged offline reaches the server after coming back online', async ({
  page,
  browser,
  context,
}) => {
  await pair(page);
  await openDay(page, '2026-10-08');
  await addExercise(page, BENCH);
  await startWorkout(page);
  await synced(page);

  await context.setOffline(true);
  await weightButton(page).click();
  await weightField(page).fill('44');
  await doneButton(page).click();
  await expect(loggedSets(page).first()).toContainText('44 kg');

  // Not on the server yet: another device doesn't see it.
  await context.setOffline(false);
  await synced(page);
  const second = await secondDevice(browser);
  await openDay(second.page, '2026-10-08');
  await expect(visible(second.page, '.lw-day__blocks')).toContainText('44');
  await second.context.close();
});

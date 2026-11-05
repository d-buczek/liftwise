import { expect, test, type Page } from '@playwright/test';
import {
  addExercise,
  BENCH,
  openDay,
  pair,
  ROW,
  startWorkout,
  doneButton,
  visible,
} from './helpers.ts';

const title = (page: Page) => visible(page, '.lw-month__title');

// A finger's swipe over the month, as the browser reports it.
async function swipe(page: Page, fromX: number, toX: number, toY = 400) {
  await page.evaluate(
    ([from, to, y]) => {
      const area = document.querySelector('.ion-page:not(.ion-page-hidden) .lw-month__viewport')!;
      const touch = (clientX: number, clientY: number) =>
        new Touch({ identifier: 1, target: area, clientX, clientY });
      area.dispatchEvent(
        new TouchEvent('touchstart', {
          bubbles: true,
          touches: [touch(from!, 400)],
          changedTouches: [touch(from!, 400)],
        }),
      );
      area.dispatchEvent(
        new TouchEvent('touchend', {
          bubbles: true,
          touches: [],
          changedTouches: [touch(to!, y!)],
        }),
      );
    },
    [fromX, toX, toY],
  );
}

test('the arrows and a swipe turn the month, and a scroll does not', async ({ page }) => {
  await pair(page);
  await expect(title(page)).toHaveText(/listopad 2026/i);

  await page.getByRole('button', { name: 'Następny miesiąc' }).click();
  await expect(title(page)).toHaveText(/grudzień 2026/i);
  await page.getByRole('button', { name: 'Poprzedni miesiąc' }).click();
  await expect(title(page)).toHaveText(/listopad 2026/i);

  await swipe(page, 300, 100);
  await expect(title(page)).toHaveText(/grudzień 2026/i);
  await swipe(page, 100, 300);
  await expect(title(page)).toHaveText(/listopad 2026/i);
  await swipe(page, 300, 280);
  await swipe(page, 300, 240, 700);
  await expect(title(page)).toHaveText(/listopad 2026/i);

  // Only one month stays in the page once the transition ends.
  await expect(page.locator('.ion-page:not(.ion-page-hidden) .lw-month__grid')).toHaveCount(1);
});

test('a day shows planned and done, and opens from the calendar', async ({ page }) => {
  await pair(page);
  await openDay(page, '2026-11-02');
  await addExercise(page, ROW);
  await page.goto('/calendar');
  const day = visible(page, '.lw-month__day[aria-label*=" 2 listopada"]');
  await expect(day).toHaveClass(/is-planned/);

  await day.click();
  await expect(page).toHaveURL(/\/calendar\/2026-11-02$/);
  await startWorkout(page);
  await doneButton(page).click();
  await page.goto('/calendar');
  await expect(visible(page, '.lw-month__day[aria-label*=" 2 listopada"]')).toHaveClass(/is-done/);
});

test('a future day can be planned but not logged', async ({ page }) => {
  await pair(page);
  await openDay(page, '2026-11-20');
  await addExercise(page, BENCH);
  await expect(page.getByRole('button', { name: /Rozpocznij trening/ })).toHaveCount(0);
});

test('a tap on a tab slides the new section in', async ({ page }) => {
  await pair(page);
  await page.evaluate(() => {
    const slides: unknown[] = [];
    Object.assign(window, { slides });
    const animate = Object.getOwnPropertyDescriptor(Element.prototype, 'animate')!
      .value as typeof Element.prototype.animate;
    Element.prototype.animate = function (keyframes, options) {
      if (JSON.stringify(keyframes).includes('32px')) slides.push(keyframes);
      return animate.call(this, keyframes, options);
    };
  });
  await page.locator('ion-tab-button').filter({ hasText: 'Historia' }).click();
  await expect(page).toHaveURL(/\/history$/);
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { slides: unknown[] }).slides.length))
    .toBe(1);
});

test('switching tabs shows each section', async ({ page }) => {
  await pair(page);
  for (const [tab, url] of [
    ['Historia', /\/history$/],
    ['Agent', /\/agent/],
    ['Ustawienia', /\/settings$/],
    ['Kalendarz', /\/calendar$/],
  ] as const) {
    await page.locator('ion-tab-button').filter({ hasText: tab }).click();
    await expect(page).toHaveURL(url);
  }
  await expect(title(page)).toBeVisible();
});

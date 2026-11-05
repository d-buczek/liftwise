import { expect, type Browser, type Page } from '@playwright/test';
import { E2E_PORT, E2E_TOKEN } from '../token.ts';

// The app's "today" in every test, so months, tiles and the workout's date rules stay fixed.
export const TODAY = '2026-11-04';

export const BENCH = 'Wyciskanie hantli na ławce płaskiej';
export const ROW = 'Wiosłowanie hantlami w opadzie tułowia';

// The clock is moved, not frozen: Vue drops an event whose time isn't later than its handler's.
export async function fixClock(page: Page) {
  await page.clock.install({ time: new Date(`${TODAY}T12:00:00`) });
  await page.clock.resume();
}

// A fresh browser pairs like a real first device, with the token.
export async function pair(page: Page) {
  await fixClock(page);
  await page.goto('/');
  await page.getByText('To pierwsze urządzenie').click();
  await page.getByLabel('Token urządzenia').fill(E2E_TOKEN);
  await page.getByRole('button', { name: 'Połącz tokenem' }).click();
  await expect(page).toHaveURL(/\/calendar$/);
  await expect(visible(page, '.lw-month__viewport')).toBeVisible();
}

// Ionic keeps the pages of a stack in the DOM, hidden: a selector must look at the shown one only.
export function visible(page: Page, selector: string) {
  return page
    .locator(`.ion-page:not(.ion-page-hidden) ${selector}`)
    .locator('visible=true')
    .first();
}

export async function addExercise(page: Page, name: string) {
  await page.getByRole('button', { name: 'Dodaj ćwiczenie' }).click();
  const picker = page.locator('ion-modal').filter({ has: page.locator('ion-searchbar') });
  await picker.locator('ion-searchbar input').fill(name);
  // The search filters after a debounce: wait for the one row, so the tap can't hit a stale one.
  const rows = picker.locator('ion-item');
  await expect(rows).toHaveCount(1);
  await expect(rows).toContainText(name);
  await rows.click();
  await expect(picker).toBeHidden();
  await expect(visible(page, '.lw-day__blocks')).toContainText(name);
}

export async function openDay(page: Page, date: string) {
  await page.goto(`/calendar/${date}`);
  await expect(page).toHaveURL(new RegExp(`/calendar/${date}$`));
}

export async function startWorkout(page: Page) {
  await page.getByRole('button', { name: /Rozpocznij trening|Wróć do treningu/ }).click();
  await expect(page).toHaveURL(/\/workout/);
  await expect(page.locator('.lw-logger')).toBeVisible();
}

export const weightButton = (page: Page) => page.locator('.lw-logger .lw-stepper__typed').first();
export const weightField = (page: Page) => page.locator('.lw-logger .lw-stepper__input').first();
export const doneButton = (page: Page) => page.locator('.lw-logger__done');
export const loggedSets = (page: Page) => page.locator('.lw-workout__sets ion-item');

// Waits until the local changes have reached the server, so another device can read them.
export async function synced(page: Page) {
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            new Promise<number>((resolve, reject) => {
              const open = indexedDB.open('liftwise');
              open.onerror = () => reject(open.error);
              open.onsuccess = () => {
                const count = open.result.transaction('outbox').objectStore('outbox').count();
                count.onsuccess = () => {
                  open.result.close();
                  resolve(count.result);
                };
              };
            }),
        ),
      { timeout: 20_000 },
    )
    .toBe(0);
}

// A second device: a new browser profile, paired with the same token, reads only what the server has.
export async function secondDevice(browser: Browser, phone = true) {
  const context = await browser.newContext({
    baseURL: `http://localhost:${E2E_PORT}`,
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
    serviceWorkers: 'block',
    ...(phone
      ? {
          viewport: { width: 375, height: 834 },
          deviceScaleFactor: 3.25,
          hasTouch: true,
          isMobile: true,
        }
      : {}),
  });
  const page = await context.newPage();
  await pair(page);
  return { context, page };
}

// Fails the test on anything the page itself reports as broken.
export function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(`console: ${message.text()}`);
  });
  return errors;
}

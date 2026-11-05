import { defineConfig } from '@playwright/test';
import { E2E_PORT } from './token.ts';

// The whole app in a real browser against a real API (docs/SPEC.md §7). One worker: the tests share
// the database, and each keeps to its own dates. `channel: 'chrome'` uses the installed Chrome.
export default defineConfig({
  testDir: './tests',
  testMatch: '*.e2e.ts',
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  reporter: [['list']],
  timeout: 45_000,
  expect: { timeout: 8_000 },
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    channel: 'chrome',
    locale: 'pl-PL',
    timezoneId: 'Europe/Warsaw',
    serviceWorkers: 'block',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      // A phone: 375 CSS px at 3.25.
      name: 'phone',
      testIgnore: '*.desktop.e2e.ts',
      use: {
        viewport: { width: 375, height: 834 },
        deviceScaleFactor: 3.25,
        hasTouch: true,
        isMobile: true,
      },
    },
    {
      name: 'desktop',
      testMatch: '*.desktop.e2e.ts',
      use: { viewport: { width: 1280, height: 800 } },
    },
  ],
  webServer: {
    command: 'node serve.ts',
    url: `http://localhost:${E2E_PORT}/health`,
    // `E2E_REUSE=1` with `node serve.ts` running keeps the server between runs while writing tests.
    reuseExistingServer: process.env.E2E_REUSE === '1',
    timeout: 240_000,
    stdout: 'ignore',
    stderr: 'pipe',
  },
});

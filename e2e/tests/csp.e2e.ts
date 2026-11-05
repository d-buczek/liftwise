import { expect, test } from '@playwright/test';
import { pair } from './helpers.ts';

type Probe = { blocked: string[]; injected?: string };

// What the policy is for (SPEC §6.8). That it blocks nothing of the app's own shows in "every screen
// opens without an error in the page": a violation is a console error.
test('an injected script does not run and nothing leaves for another site', async ({ page }) => {
  await pair(page);
  const response = await page.goto('/calendar');
  expect(response?.headers()['content-security-policy']).toBe("frame-ancestors 'none'");

  // The violations themselves: a failed fetch alone could be the other site's CORS or no network.
  await page.evaluate(() => {
    const probe: Probe = { blocked: [] };
    Object.assign(window, { probe });
    document.addEventListener('securitypolicyviolation', (event) =>
      probe.blocked.push(event.effectiveDirective),
    );
    const script = document.createElement('script');
    script.textContent = 'window.probe.injected = "ran"';
    document.head.append(script);
    void fetch('https://example.com/', { mode: 'no-cors' }).catch(() => undefined);
  });
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { probe: Probe }).probe))
    .toEqual({ blocked: ['script-src-elem', 'connect-src'] });
});

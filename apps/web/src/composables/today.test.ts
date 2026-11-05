import { afterEach, beforeEach, expect, it, vi } from 'vite-plus/test';

// The module keeps its state: every test imports a fresh copy at its own time. Only the clock and
// the interval are fake, since loading a module needs real timeouts.
async function loadAt(now: Date) {
  vi.setSystemTime(now);
  const { useToday } = await import('./today');
  return useToday;
}

beforeEach(() => {
  vi.resetModules();
  vi.useFakeTimers({ toFake: ['Date', 'setInterval', 'clearInterval'] });
});
afterEach(() => vi.useRealTimers());

it('an app left open overnight moves to the new day within a minute of midnight', async () => {
  const useToday = await loadAt(new Date(2026, 11, 31, 23, 58, 30));
  const date = useToday();
  expect(date.value).toBe('2026-12-31');

  vi.advanceTimersByTime(60_000); // 23:59:30
  expect(date.value).toBe('2026-12-31');

  vi.advanceTimersByTime(60_000); // 00:00:30
  expect(date.value).toBe('2027-01-01');
});

it('catches up at once when the app shows again: a suspended phone runs no timers', async () => {
  const useToday = await loadAt(new Date(2026, 10, 5, 22, 0));
  const date = useToday();

  vi.setSystemTime(new Date(2026, 10, 6, 7, 30));
  expect(date.value).toBe('2026-11-05');
  document.dispatchEvent(new Event('visibilitychange'));
  expect(date.value).toBe('2026-11-06');
});

it('shows the current date on first use, not the one the module was loaded at', async () => {
  const useToday = await loadAt(new Date(2026, 10, 5, 23, 50));
  vi.setSystemTime(new Date(2026, 10, 6, 0, 10));
  expect(useToday().value).toBe('2026-11-06');
});

it('gives every screen the same date with one timer between them', async () => {
  const useToday = await loadAt(new Date(2026, 10, 5, 23, 59, 30));
  const calendar = useToday();
  const agent = useToday();
  expect(vi.getTimerCount()).toBe(1);

  vi.advanceTimersByTime(60_000);
  expect(calendar.value).toBe('2026-11-06');
  expect(agent.value).toBe('2026-11-06');
});

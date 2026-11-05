import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { db } from './db/database';
import { router } from './router';
import { useAuthStore } from './stores/auth';
import { resetDb } from './testing';

const path = () => router.currentRoute.value.fullPath;

async function go(to: string) {
  await router.push(to);
  return path();
}

const pairDevice = () => db.device.put({ id: 'device', deviceId: 'phone', token: 'token' });

beforeEach(async () => {
  await resetDb();
  setActivePinia(createPinia());
  // Leaves the previous test's route, since `beforeEnter` runs only on entering one.
  await router.push('/pair');
  // A new start of the app: the guard has yet to read the stored pairing.
  setActivePinia(createPinia());
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('pairing guard', () => {
  it.each(['/', '/calendar', '/settings/devices', '/calendar/2026-11-01', '/no/such/page'])(
    'sends an unpaired device from %s to the pairing screen',
    async (to) => {
      expect(await go(to)).toBe('/pair');
    },
  );

  it('reads the stored pairing first, so a paired device opens the page it asked for', async () => {
    await pairDevice();
    expect(await go('/settings/devices')).toBe('/settings/devices');
  });

  it('sends a paired device away from the pairing screen', async () => {
    await pairDevice();
    await go('/settings');
    expect(await go('/pair')).toBe('/calendar');
  });

  it('lets a device in as soon as it pairs', async () => {
    expect(await go('/calendar')).toBe('/pair');
    useAuthStore().device = { id: 'device', deviceId: 'phone', token: 'token' };
    expect(await go('/calendar')).toBe('/calendar');
  });

  it('sends a revoked device back to pairing on its next navigation', async () => {
    await pairDevice();
    await go('/settings');
    await useAuthStore().forget();
    expect(await go('/history')).toBe('/pair');
  });

  it('lets nobody in when the stored pairing cannot be read', async () => {
    const read = vi.spyOn(db.device, 'get').mockRejectedValue(new Error('IndexedDB failed'));
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    await router.push('/settings');
    expect(path()).toBe('/pair');
    expect(useAuthStore().storageFailed).toBe(true);

    // The next navigation reads again: a passing failure doesn't lock a paired device out.
    read.mockRestore();
    await router.push('/settings');
    expect(useAuthStore().storageFailed).toBe(false);
  });
});

describe('routes guarded by their params', () => {
  beforeEach(async () => {
    await pairDevice();
    // Only the clock: IndexedDB in the tests needs real timers.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 10, 5, 12));
  });

  it.each([
    ['/calendar/not-a-date', '/calendar'],
    ['/history/not-a-date', '/history'],
    ['/calendar/2026-02-30', '/calendar'],
    ['/calendar/2026-13-01', '/calendar'],
    ['/calendar/not-a-date/workout', '/calendar'],
    ['/history/2026-02-30/workout', '/history'],
  ])('an invalid date goes back to the section: %s → %s', async (to, section) => {
    expect(await go(to)).toBe(section);
  });

  it.each(['/calendar/2026-11-04', '/history/2024-02-29', '/calendar/2026-12-24'])(
    'opens the day %s, past or future (its plan)',
    async (to) => {
      expect(await go(to)).toBe(to);
    },
  );

  it.each(['/calendar/2026-11-05/workout', '/history/2026-10-01/workout?exercise=press'])(
    'opens the workout of a day that has started: %s',
    async (to) => {
      expect(await go(to)).toBe(to);
    },
  );

  it.each([
    ['/calendar/2026-11-06/workout', '/calendar/2026-11-06'],
    ['/history/2027-01-01/workout', '/history/2027-01-01'],
  ])('a future day has no workout to log: %s → %s, same section', async (to, day) => {
    expect(await go(to)).toBe(day);
  });

  it("opens tomorrow's workout only once the local date has turned", async () => {
    vi.setSystemTime(new Date(2026, 10, 5, 23, 59, 59));
    expect(await go('/calendar/2026-11-06/workout')).toBe('/calendar/2026-11-06');

    vi.setSystemTime(new Date(2026, 10, 6, 0, 0, 1));
    expect(await go('/calendar/2026-11-06/workout')).toBe('/calendar/2026-11-06/workout');
  });

  it.each([
    ['/history/muscle/chest', '/history/muscle/chest'],
    ['/history/muscle/not-a-muscle', '/history'],
    // Without a group it reads as a day, which isn't a date either.
    ['/history/muscle', '/history'],
  ])('a muscle history needs a real muscle group: %s → %s', async (to, result) => {
    expect(await go(to)).toBe(result);
  });

  it('sends anything else to the calendar', async () => {
    expect(await go('/')).toBe('/calendar');
    await go('/settings');
    expect(await go('/no/such/page')).toBe('/calendar');
  });
});

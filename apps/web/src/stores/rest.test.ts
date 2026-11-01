import { createPinia, setActivePinia } from 'pinia';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { cancelRestAlarm, restAlarmNotifies, scheduleRestAlarm } from '../native/restAlarm';
import { useRestStore } from './rest';

const vibrate = vi.fn<(pattern: number[]) => boolean>(() => true);

// The Android notification; in the browser it does nothing.
vi.mock('../native/restAlarm', () => ({
  scheduleRestAlarm: vi.fn<typeof scheduleRestAlarm>(),
  cancelRestAlarm: vi.fn<typeof cancelRestAlarm>(),
  restAlarmNotifies: vi.fn<typeof restAlarmNotifies>(() => false),
}));

describe('rest store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-01T18:00:00Z'));
    localStorage.clear();
    vibrate.mockClear();
    vi.clearAllMocks();
    Object.defineProperty(navigator, 'vibrate', { value: vibrate, configurable: true });
    setActivePinia(createPinia());
  });

  afterEach(() => vi.useRealTimers());

  it('counts down and ends with a vibration and the finished state', () => {
    const rest = useRestStore();
    rest.start(90);
    expect([rest.running, rest.remainingS, rest.progress]).toEqual([true, 90, 1]);

    vi.advanceTimersByTime(45_000);
    expect([rest.remainingS, rest.progress]).toEqual([45, 0.5]);

    vi.advanceTimersByTime(45_000);
    expect([rest.running, rest.finished]).toEqual([false, true]);
    expect(vibrate).toHaveBeenCalledOnce();

    rest.dismiss();
    expect(rest.finished).toBe(false);
  });

  it('adjusts by seconds, skips, and treats 0 s as no timer', () => {
    const rest = useRestStore();
    rest.start(60);
    rest.adjust(15);
    expect([rest.remainingS, rest.progress]).toEqual([75, 1]);
    rest.adjust(-15);
    rest.adjust(-15);
    expect(rest.remainingS).toBe(45);

    rest.skip();
    expect([rest.running, rest.finished]).toEqual([false, false]);
    expect(vibrate).not.toHaveBeenCalled();

    rest.start(0);
    expect(rest.running).toBe(false);
  });

  it('ends at once when −15 s passes the end', () => {
    const rest = useRestStore();
    rest.start(10);
    rest.adjust(-15);
    expect([rest.running, rest.finished]).toEqual([false, true]);
  });

  it('survives a reload while running, not after the end', () => {
    useRestStore().start(120);
    vi.advanceTimersByTime(20_000);

    setActivePinia(createPinia());
    expect(useRestStore().remainingS).toBe(100);

    vi.advanceTimersByTime(200_000);
    setActivePinia(createPinia());
    localStorage.setItem('liftwise.rest', JSON.stringify({ endsAt: Date.now() - 1, totalS: 120 }));
    const restored = useRestStore();
    expect([restored.running, restored.finished]).toEqual([false, false]);
    expect(localStorage.getItem('liftwise.rest')).toBeNull();
  });

  it('schedules the notification for the end, moves it with the rest and cancels it', () => {
    const rest = useRestStore();
    const start = Date.now();
    rest.start(90);
    expect(scheduleRestAlarm).toHaveBeenLastCalledWith(
      start + 90_000,
      'Przerwa skończona',
      'Koniec przerwy',
    );
    rest.adjust(15);
    expect(scheduleRestAlarm).toHaveBeenLastCalledWith(
      start + 105_000,
      'Przerwa skończona',
      'Koniec przerwy',
    );
    expect(cancelRestAlarm).not.toHaveBeenCalled();

    rest.skip();
    expect(cancelRestAlarm).toHaveBeenCalledOnce();
    rest.start(0);
    expect(cancelRestAlarm).toHaveBeenCalledTimes(2);
  });

  it('leaves the vibration to a notification that can alert, then clears it on dismiss', () => {
    vi.mocked(restAlarmNotifies).mockReturnValue(true);
    const rest = useRestStore();
    rest.start(30);
    vi.advanceTimersByTime(30_000);
    expect([rest.running, rest.finished]).toEqual([false, true]);
    expect(vibrate).not.toHaveBeenCalled();
    // The rest ended by itself: the notification is due now and must not be cancelled.
    expect(cancelRestAlarm).not.toHaveBeenCalled();

    rest.dismiss();
    expect(cancelRestAlarm).toHaveBeenCalledOnce();
  });
});

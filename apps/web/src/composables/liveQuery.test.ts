import { newId, workoutSchema } from '@liftwise/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { effectScope, nextTick, ref, type EffectScope } from 'vue';
import { db } from '../db/database';
import { applyLocal } from '../db/mutate';
import { resetDb } from '../testing';
import { useLiveQuery, useLiveQueryState } from './liveQuery';

let scopes: EffectScope[] = [];

// Runs a composable the way a screen does; the scope stands for the screen's life.
function onScreen<T>(setup: () => T) {
  const scope = effectScope();
  scopes.push(scope);
  return { scope, result: scope.run(setup) as T };
}

const addWorkout = (date: string) =>
  applyLocal([
    {
      op: 'upsert',
      entity: 'workouts',
      row: workoutSchema.parse({ id: newId(), date, label_id: null }),
    },
  ]);

const datesOn = (date: string) => async () =>
  (await db.workouts.where('date').equals(date).toArray()).map((workout) => workout.date);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => (resolve = done));
  return { promise, resolve };
}

describe('useLiveQueryState', () => {
  beforeEach(resetDb);
  afterEach(() => {
    for (const scope of scopes) scope.stop();
    scopes = [];
    vi.restoreAllMocks();
  });

  it('tells a read still running from an empty result, so no empty state flashes', async () => {
    const { result } = onScreen(() => useLiveQueryState(datesOn('2026-11-01'), null));
    expect(result.data.value).toBeNull();
    expect(result.loaded.value).toBe(false);

    await vi.waitFor(() => expect(result.loaded.value).toBe(true));
    expect(result.data.value).toEqual([]);
  });

  it('follows a write to what the query read', async () => {
    const { result } = onScreen(() => useLiveQueryState(datesOn('2026-11-01'), null));
    await vi.waitFor(() => expect(result.data.value).toEqual([]));

    await addWorkout('2026-11-01');
    await vi.waitFor(() => expect(result.data.value).toEqual(['2026-11-01']));
  });

  it('with deps, reads again for the new value and keeps following that', async () => {
    const date = ref('2026-11-01');
    await addWorkout('2026-11-01');
    const { result: data } = onScreen(() =>
      useLiveQuery(() => datesOn(date.value)(), [] as string[], date),
    );
    await vi.waitFor(() => expect(data.value).toEqual(['2026-11-01']));

    date.value = '2026-11-02';
    await vi.waitFor(() => expect(data.value).toEqual([]));

    await addWorkout('2026-11-02');
    await vi.waitFor(() => expect(data.value).toEqual(['2026-11-02']));
  });

  it("doesn't let a slow read of the previous value overwrite the new one", async () => {
    const reads = { old: deferred<string>(), fresh: deferred<string>() };
    const key = ref<keyof typeof reads>('old');
    const started: string[] = [];
    const { result } = onScreen(() =>
      useLiveQueryState(
        () => {
          started.push(key.value);
          return reads[key.value].promise;
        },
        'none',
        key,
      ),
    );
    // A query starts on a later task, so wait until the old read is really under way.
    await vi.waitFor(() => expect(started).toEqual(['old']));
    key.value = 'fresh';
    await nextTick();
    await vi.waitFor(() => expect(started).toEqual(['old', 'fresh']));

    reads.fresh.resolve('fresh');
    await vi.waitFor(() => expect(result.data.value).toBe('fresh'));

    reads.old.resolve('old');
    await reads.old.promise;
    await new Promise((resolve) => setTimeout(resolve));
    expect(result.data.value).toBe('fresh');
  });

  it('stops following when the screen goes away', async () => {
    const closed = onScreen(() => useLiveQueryState(datesOn('2026-11-01'), null));
    const open = onScreen(() => useLiveQueryState(datesOn('2026-11-01'), null));
    await vi.waitFor(() => expect(closed.result.loaded.value).toBe(true));
    await vi.waitFor(() => expect(open.result.loaded.value).toBe(true));
    closed.scope.stop();

    await addWorkout('2026-11-01');
    // The one still open shows that the change has gone around.
    await vi.waitFor(() => expect(open.result.data.value).toEqual(['2026-11-01']));
    expect(closed.result.data.value).toEqual([]);
  });

  it('a failed read is logged, leaves the screen not loaded, and the next deps read again', async () => {
    const failure = new Error('read failed');
    const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const broken = ref(true);
    const { result } = onScreen(() =>
      useLiveQueryState(
        async () => {
          if (broken.value) throw failure;
          return 'data';
        },
        'initial',
        broken,
      ),
    );
    await vi.waitFor(() => expect(log).toHaveBeenCalledWith(failure));
    expect(result.loaded.value).toBe(false);
    expect(result.data.value).toBe('initial');

    broken.value = false;
    await vi.waitFor(() => expect(result.loaded.value).toBe(true));
    expect(result.data.value).toBe('data');
  });
});

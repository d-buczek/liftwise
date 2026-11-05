import {
  ATHLETE_PROFILE_ID,
  DEFAULT_BALANCE_SETTINGS,
  DEFAULT_TRAINING_SETTINGS,
  newId,
  SETTING_IDS,
  workoutSchema,
  type DatedSet,
  type ModelSettings,
  type SyncFields,
  type SyncRow,
  type TrainingSettings,
  type WorkoutSet,
} from '@liftwise/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import { effectScope } from 'vue';
import { useLiveQueryState } from '../composables/liveQuery';
import { db } from '../db/database';
import { applyLocal } from '../db/mutate';
import { dumbbells, makeExercise, makeSet, resetDb } from '../testing';
import {
  allWorkouts,
  athleteProfile,
  balanceSettings,
  catalog,
  dayData,
  equipment,
  exercise,
  historySets,
  rangeData,
  savedModelSettings,
  trainingSettings,
  workoutLabels,
  type DayData,
} from './queries';

const STAMP = '2026-10-31T10:00:00.000Z';
const alive: SyncFields = { created_at: STAMP, updated_at: STAMP, deleted_at: null, seq: 1 };
const deleted: SyncFields = { ...alive, deleted_at: STAMP };

async function addWorkout(date: string, sync = alive) {
  const row = { ...workoutSchema.parse({ id: newId(), date, label_id: null }), ...sync };
  await db.workouts.put(row);
  return row;
}

async function addSet(workout: { id: string }, fields: Partial<WorkoutSet> = {}, sync = alive) {
  const row: SyncRow<'sets'> = { ...makeSet({ workout_id: workout.id, ...fields }), ...sync };
  await db.sets.put(row);
  return row;
}

const ids = (rows: { id: string }[]) => rows.map((row) => row.id).sort();
const idsOf = (...rows: { id: string }[]) => ids(rows);

beforeEach(resetDb);

describe('dayData', () => {
  it("returns the day's workouts and their sets, nothing of other days", async () => {
    const workout = await addWorkout('2026-11-01');
    const set = await addSet(workout);
    await addSet(await addWorkout('2026-11-02'));

    const day = await dayData('2026-11-01');
    expect(ids(day.workouts)).toEqual([workout.id]);
    expect(ids(day.sets)).toEqual([set.id]);
  });

  it('leaves out deleted sets, and every set of a deleted workout', async () => {
    const workout = await addWorkout('2026-11-01');
    const kept = await addSet(workout);
    await addSet(workout, {}, deleted);
    const removed = await addWorkout('2026-11-01', deleted);
    await addSet(removed);

    const day = await dayData('2026-11-01');
    expect(ids(day.workouts)).toEqual([workout.id]);
    expect(ids(day.sets)).toEqual([kept.id]);
  });

  it('is empty for a day without workouts', async () => {
    expect(await dayData('2026-11-01')).toEqual({ workouts: [], sets: [] });
  });
});

describe('rangeData', () => {
  it('includes both bounds and nothing outside them', async () => {
    const first = await addWorkout('2026-11-01');
    const last = await addWorkout('2026-11-30');
    const firstSet = await addSet(first);
    const lastSet = await addSet(last);
    await addSet(last, {}, deleted);
    await addSet(await addWorkout('2026-10-31'));
    await addSet(await addWorkout('2026-12-01'));
    await addSet(await addWorkout('2026-11-15', deleted));

    const month = await rangeData('2026-11-01', '2026-11-30');
    expect(ids(month.workouts)).toEqual(idsOf(first, last));
    expect(ids(month.sets)).toEqual(idsOf(firstSet, lastSet));
  });
});

describe('historySets', () => {
  it('gives every set the date of its workout', async () => {
    const workout = await addWorkout('2026-11-01');
    const set = await addSet(workout);
    expect(await historySets()).toEqual([{ ...set, date: '2026-11-01' }]);
  });

  it('leaves out deleted sets, sets of a deleted workout and sets whose workout is not here', async () => {
    const workout = await addWorkout('2026-11-01');
    const kept = await addSet(workout);
    await addSet(workout, {}, deleted);
    await addSet(await addWorkout('2026-11-02', deleted));
    await addSet({ id: newId() });

    expect(ids(await historySets())).toEqual([kept.id]);
  });

  it('filters by exercise; asked for no exercises it returns no sets, not all', async () => {
    const workout = await addWorkout('2026-11-01');
    const press = newId();
    const set = await addSet(workout, { exercise_id: press });
    await addSet(workout, { exercise_id: newId() });

    expect(ids(await historySets([press]))).toEqual([set.id]);
    expect(await historySets([])).toEqual([]);
  });
});

describe('following the data on a screen', () => {
  let stop: () => void;

  // The query's first read has finished when this returns, so what comes next is following.
  async function live<T>(query: () => Promise<T>, initial: T) {
    const scope = effectScope();
    stop = () => scope.stop();
    const { data, loaded } = scope.run(() => useLiveQueryState(query, initial))!;
    await vi.waitFor(() => expect(loaded.value).toBe(true));
    return data;
  }

  afterEach(() => stop());

  it('an empty day shows the first set logged and drops it when it is deleted', async () => {
    const date = '2026-11-01';
    const day = await live<DayData>(() => dayData(date), { workouts: [], sets: [] });
    expect(day.value).toEqual({ workouts: [], sets: [] });

    const workout = workoutSchema.parse({ id: newId(), date, label_id: null });
    const set = makeSet({ workout_id: workout.id });
    await applyLocal([
      { op: 'upsert', entity: 'workouts', row: workout },
      { op: 'upsert', entity: 'sets', row: set },
    ]);
    await vi.waitFor(() => expect(ids(day.value.sets)).toEqual([set.id]));

    await applyLocal([{ op: 'delete', entity: 'sets', row: { id: set.id } }]);
    await vi.waitFor(() => expect(day.value.sets).toEqual([]));
  });

  it('history drops the sets of a workout deleted on another device', async () => {
    const workout = await addWorkout('2026-11-01');
    const set = await addSet(workout);
    const history = await live<DatedSet[]>(historySets, []);
    expect(ids(history.value)).toEqual([set.id]);

    // A pull writes the tombstone of the workout; its sets may come later.
    await db.workouts.put({ ...workout, ...deleted });
    await vi.waitFor(() => expect(history.value).toEqual([]));
  });
});

describe('tombstones in lists and lookups', () => {
  it('allWorkouts, catalog and equipment hide deleted rows', async () => {
    const workout = await addWorkout('2026-11-01');
    await addWorkout('2026-11-02', deleted);
    expect(ids(await allWorkouts())).toEqual([workout.id]);

    const press = { ...makeExercise(), ...alive };
    const removed = { ...makeExercise(), ...deleted };
    await db.exercises.bulkPut([press, removed]);
    expect(ids(await catalog())).toEqual([press.id]);

    const rack = { ...dumbbells(), ...alive };
    await db.equipment_items.bulkPut([rack, { ...dumbbells(), ...deleted }]);
    expect(ids(await equipment())).toEqual([rack.id]);
  });

  it('exercise finds a live row only', async () => {
    const press = { ...makeExercise(), ...alive };
    const removed = { ...makeExercise(), ...deleted };
    await db.exercises.bulkPut([press, removed]);

    expect((await exercise(press.id))?.id).toBe(press.id);
    expect(await exercise(removed.id)).toBeUndefined();
    expect(await exercise(newId())).toBeUndefined();
  });
});

describe('workoutLabels', () => {
  const label = (name: string, archived: boolean, sync = alive): SyncRow<'workout_labels'> => ({
    id: newId(),
    name,
    color: 'cobalt',
    archived,
    ...sync,
  });

  it('keeps archived labels, after the active ones, sorted the Polish way', async () => {
    await db.workout_labels.bulkPut([
      label('Stary', true),
      label('Łydki', false),
      label('Pull', false),
      label('Lekki', false),
      label('Usunięty', false, deleted),
    ]);
    const labels = await workoutLabels();
    expect(labels.map((row) => row.name)).toEqual(['Lekki', 'Łydki', 'Pull', 'Stary']);
  });
});

describe('settings', () => {
  const training: TrainingSettings = {
    rest_seconds: 75,
    target_rir: { min: 0, max: 1 },
    weight_step_kg: 2,
  };
  const trainingRow = (sync: SyncFields): SyncRow<'settings'> => ({
    id: SETTING_IDS.training,
    key: 'training',
    value: training,
    ...sync,
  });

  it('uses the defaults until something is saved', async () => {
    expect(await trainingSettings()).toEqual(DEFAULT_TRAINING_SETTINGS);
    expect(await balanceSettings()).toEqual(DEFAULT_BALANCE_SETTINGS);
    expect(await savedModelSettings()).toBeNull();
    expect(await athleteProfile()).toBe('');
  });

  it('reads what was saved', async () => {
    await db.settings.put(trainingRow(alive));
    expect(await trainingSettings()).toEqual(training);

    const weekly_sets = {
      ...DEFAULT_BALANCE_SETTINGS.weekly_sets,
      chest: { min: 4, max: 8 },
    };
    await db.settings.put({
      id: SETTING_IDS.balance,
      key: 'balance',
      value: { weekly_sets },
      ...alive,
    });
    expect((await balanceSettings()).weekly_sets.chest).toEqual({ min: 4, max: 8 });

    const models: ModelSettings = {
      fast: { provider: 'google', model: 'fast-model' },
      planner: { provider: 'anthropic', model: 'planner-model' },
    };
    await db.settings.put({ id: SETTING_IDS.models, key: 'models', value: models, ...alive });
    expect(await savedModelSettings()).toEqual(models);

    await db.athlete_profile.put({ id: ATHLETE_PROFILE_ID, content: '# Cel', ...alive });
    expect(await athleteProfile()).toBe('# Cel');
  });

  it('goes back to the defaults when the saved row is deleted', async () => {
    await db.settings.put(trainingRow(deleted));
    expect(await trainingSettings()).toEqual(DEFAULT_TRAINING_SETTINGS);

    await db.settings.put({
      id: SETTING_IDS.balance,
      key: 'balance',
      value: {
        weekly_sets: { ...DEFAULT_BALANCE_SETTINGS.weekly_sets, chest: { min: 4, max: 8 } },
      },
      ...deleted,
    });
    expect(await balanceSettings()).toEqual(DEFAULT_BALANCE_SETTINGS);

    await db.settings.put({
      id: SETTING_IDS.models,
      key: 'models',
      value: {
        fast: { provider: 'google', model: 'fast-model' },
        planner: { provider: 'google', model: 'planner-model' },
      },
      ...deleted,
    });
    expect(await savedModelSettings()).toBeNull();

    await db.athlete_profile.put({ id: ATHLETE_PROFILE_ID, content: '# Cel', ...deleted });
    expect(await athleteProfile()).toBe('');
  });
});

import {
  ATHLETE_PROFILE_ID,
  DEFAULT_BALANCE_SETTINGS,
  DEFAULT_TRAINING_SETTINGS,
  newId,
  seedCatalog,
  SETTING_IDS,
} from '@liftwise/core';
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import {
  createDevice,
  db,
  push,
  remove,
  repsExercise,
  timedExercise,
  upsert,
} from '../../test/helpers';
import { done, pushDay } from '../../test/tools';
import {
  balanceSettings,
  catalog,
  days,
  equipment,
  history,
  labels,
  profile,
  setsById,
  trainingSettings,
} from './data';

let token: string;
beforeEach(async () => {
  ({ token } = await createDevice());
});

describe('the data the tools read', () => {
  it('leaves out deleted rows of every singleton and list', async () => {
    const item = { id: newId(), type: 'dumbbells', props: { max_kg: 30 } };
    const label = { id: newId(), name: 'A', color: 'teal' };
    await push(token, [
      upsert('equipment_items', item),
      upsert('workout_labels', label),
      upsert('athlete_profile', { id: ATHLETE_PROFILE_ID, content: 'Cel' }),
      remove('exercises', repsExercise.id),
    ]);
    expect(await equipment(db())).toHaveLength(1);
    expect(await labels(db())).toHaveLength(1);
    expect(await profile(db())).toBe('Cel');
    const names = (await catalog(db())).map((exercise) => exercise.id);
    expect(names).toHaveLength(seedCatalog().length - 1);
    expect(names).not.toContain(repsExercise.id);

    await push(token, [
      remove('equipment_items', item.id),
      remove('workout_labels', label.id),
      remove('athlete_profile', ATHLETE_PROFILE_ID),
    ]);
    expect(await equipment(db())).toEqual([]);
    expect(await labels(db())).toEqual([]);
    expect(await profile(db())).toBe('');
  });

  it('falls back to the default settings, without a row or with a deleted one', async () => {
    expect(await trainingSettings(db())).toEqual(DEFAULT_TRAINING_SETTINGS);
    expect(await balanceSettings(db())).toEqual(DEFAULT_BALANCE_SETTINGS);

    const value = { rest_seconds: 75, target_rir: { min: 0, max: 3 }, weight_step_kg: 2.5 };
    const weekly_sets = { ...DEFAULT_BALANCE_SETTINGS.weekly_sets, chest: { min: 4, max: 8 } };
    await push(token, [
      upsert('settings', { id: SETTING_IDS.training, key: 'training', value }),
      upsert('settings', { id: SETTING_IDS.balance, key: 'balance', value: { weekly_sets } }),
    ]);
    expect(await trainingSettings(db())).toEqual(value);
    expect(await balanceSettings(db())).toEqual({ weekly_sets });

    await push(token, [remove('settings', SETTING_IDS.training)]);
    expect(await trainingSettings(db())).toEqual(DEFAULT_TRAINING_SETTINGS);
  });

  it('reads days inclusively, sets in position order, none of a deleted workout', async () => {
    const first = await pushDay(token, '2026-10-20', [{ position: 2 }, { position: 1 }]);
    await pushDay(token, '2026-10-21', [{ position: 0 }]);
    await pushDay(token, '2026-10-22', [{ position: 0 }]);
    const deleted = await pushDay(token, '2026-10-21', [{ position: 5 }]);
    const removedSet = first.sets[0]?.id as string;
    await push(token, [remove('workouts', deleted.workout.id)]);

    const range = await days(db(), '2026-10-20', '2026-10-21');
    expect(range.workouts.map((workout) => workout.date)).toEqual(['2026-10-20', '2026-10-21']);
    expect(range.sets.map(({ date, position }) => [date, position])).toEqual([
      ['2026-10-20', 1],
      ['2026-10-20', 2],
      ['2026-10-21', 0],
    ]);

    await push(token, [remove('sets', removedSet)]);
    const left = await days(db(), '2026-10-20', '2026-10-20');
    expect(left.sets.map((set) => set.position)).toEqual([1]);
  });

  it('reads the history of the asked exercises, planned sets too', async () => {
    await pushDay(token, '2026-10-20', [
      done(),
      { status: 'planned' },
      done({ exercise_id: timedExercise.id, reps: null, duration_s: 45 }),
    ]);
    expect(await history(db())).toHaveLength(3);
    const only = await history(db(), [repsExercise.id]);
    expect(only.map((set) => set.status)).toEqual(['done', 'planned']);
    expect(only[0]?.date).toBe('2026-10-20');
    expect(await history(db(), [])).toEqual([]);
  });

  it('finds sets by id with their date, only live ones', async () => {
    const {
      workout,
      sets: [first, second],
    } = await pushDay(token, '2026-10-20', [done(), done()]);
    const orphan = await pushDay(token, '2026-10-21', [done()]);
    await push(token, [
      remove('sets', second?.id as string),
      remove('workouts', orphan.workout.id),
    ]);

    expect(await setsById(db(), [])).toEqual([]);
    const found = await setsById(db(), [
      first?.id as string,
      second?.id as string,
      orphan.sets[0]?.id as string,
      newId(),
    ]);
    expect(found).toMatchObject([{ id: first?.id, workout_id: workout.id, date: '2026-10-20' }]);
  });
});

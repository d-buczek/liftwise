import { newId, workoutSchema } from '@liftwise/core';
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { makeExercise, makeSet, resetDb } from '../testing';
import { db } from './database';
import { exportCsv, exportJson } from './export';

const sync = {
  created_at: '2026-10-31T10:00:00.000Z',
  updated_at: '2026-10-31T10:00:00.000Z',
  seq: 1,
};

describe('export', () => {
  beforeEach(resetDb);

  async function seed() {
    const exercise = {
      ...makeExercise({ name_pl: 'Wyciskanie, hantle' }),
      ...sync,
      deleted_at: null,
    };
    const workout = {
      ...workoutSchema.parse({ id: newId(), date: '2026-10-30' }),
      ...sync,
      deleted_at: null,
    };
    const set = {
      ...makeSet({ workout_id: workout.id, exercise_id: exercise.id }),
      ...sync,
      deleted_at: null,
    };
    const deleted = {
      ...makeSet({ workout_id: workout.id, exercise_id: exercise.id, position: 1 }),
      ...sync,
      deleted_at: sync.updated_at,
    };
    await db.exercises.put(exercise);
    await db.workouts.put(workout);
    await db.sets.bulkPut([set, deleted]);
    return { exercise, workout, set };
  }

  it('writes the mirror without tombstones as JSON', async () => {
    const { exercise, workout, set } = await seed();
    const file = await exportJson('2026-11-01', new Date('2026-11-01T12:00:00.000Z'));
    expect(file).toMatchObject({ name: 'liftwise-2026-11-01.json', type: 'application/json' });
    const backup = JSON.parse(file.content);
    expect(backup).toMatchObject({
      app: 'liftwise',
      version: 1,
      exported_at: '2026-11-01T12:00:00.000Z',
    });
    expect(backup.tables.exercises).toEqual([exercise]);
    expect(backup.tables.workouts).toEqual([workout]);
    expect(backup.tables.sets).toEqual([set]);
    expect(backup.tables.settings).toEqual([]);
  });

  it('writes done sets as CSV with a BOM', async () => {
    await seed();
    const file = await exportCsv('2026-11-01');
    expect(file).toMatchObject({ name: 'liftwise-2026-11-01.csv', type: 'text/csv' });
    expect(file.content).toBe(
      '﻿date,exercise,set,weight_kg,reps,duration_s,rir,warmup\r\n' +
        '2026-10-30,"Wyciskanie, hantle",1,20,10,,,false\r\n',
    );
  });
});

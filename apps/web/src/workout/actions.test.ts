import { newId, workoutSchema, type WorkoutSet } from '@liftwise/core';
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { db } from '../db/database';
import { applyLocal } from '../db/mutate';
import { makeExercise, makeSet, resetDb } from '../testing';
import { addExercise, copyDay, deleteSets, restoreSets } from './actions';
import { dayData } from './queries';

const press = makeExercise({ weight_step_kg: 2 });

async function seedDay(date: string, sets: Partial<WorkoutSet>[]) {
  const workout = workoutSchema.parse({ id: newId(), date });
  const rows = sets.map((fields, position) =>
    makeSet({ workout_id: workout.id, exercise_id: press.id, position, ...fields }),
  );
  await applyLocal([
    { op: 'upsert', entity: 'exercises', row: press },
    { op: 'upsert', entity: 'workouts', row: workout },
    ...rows.map((row) => ({ op: 'upsert' as const, entity: 'sets' as const, row })),
  ]);
  return { workout, rows };
}

async function groupsOf(entityIds: string[]) {
  const entries = await db.outbox.toArray();
  return new Set(
    entries
      .filter((entry) => entityIds.includes(entry.entityId))
      .map((entry) => entry.mutation.groupId),
  );
}

describe('day actions', () => {
  beforeEach(resetDb);

  it('copies a day onto an empty one: a new workout and planned sets in one group', async () => {
    await seedDay('2026-10-01', [{ weight_kg: 20 }, { weight_kg: 20, reps: 8 }]);
    const copied = await copyDay('2026-10-01', '2026-10-04', false);

    const target = await dayData('2026-10-04');
    expect(target.workouts).toHaveLength(1);
    expect(target.sets.map((set) => [set.status, set.reps, set.source])).toEqual([
      ['planned', 10, 'copy'],
      ['planned', 8, 'copy'],
    ]);
    expect(copied.map((set) => set.id)).toEqual(target.sets.map((set) => set.id));
    const ids = [...target.workouts, ...target.sets].map((row) => row.id);
    expect(await groupsOf(ids)).toHaveLength(1);
  });

  it('appends after the sets the day already has; light drops a set and lowers the weight', async () => {
    await seedDay('2026-10-01', [{ weight_kg: 20 }, { weight_kg: 20 }]);
    const { workout } = await seedDay('2026-10-04', [{ status: 'planned', weight_kg: 10 }]);
    await copyDay('2026-10-01', '2026-10-04', true);

    const target = await dayData('2026-10-04');
    expect(target.workouts.map((row) => row.id)).toEqual([workout.id]);
    const copied = target.sets.filter((set) => set.source === 'copy');
    // One working set fewer; 10% of 20 kg is one 2 kg step.
    expect(copied.map((set) => [set.position, set.weight_kg])).toEqual([[1, 18]]);
  });

  it('adds an exercise with its last session as planned sets', async () => {
    await seedDay('2026-10-01', [{ weight_kg: 22, reps: 9 }]);
    await addExercise('2026-10-05', press);
    const day = await dayData('2026-10-05');
    expect(day.sets).toMatchObject([{ status: 'planned', weight_kg: 22, reps: 9, position: 0 }]);
  });

  it('restores deleted sets', async () => {
    const { rows } = await seedDay('2026-10-01', [{}, {}]);
    await deleteSets(rows);
    expect((await dayData('2026-10-01')).sets).toEqual([]);
    await restoreSets(rows);
    const restored = await dayData('2026-10-01');
    expect(restored.sets.map((set) => set.id).sort()).toEqual(rows.map((row) => row.id).sort());
  });
});

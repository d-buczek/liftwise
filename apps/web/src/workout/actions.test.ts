import { newId, workoutSchema, type WorkoutSet } from '@liftwise/core';
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { db } from '../db/database';
import { applyLocal } from '../db/mutate';
import { makeExercise, makeSet, resetDb } from '../testing';
import { addExercise, copyDay, deleteSets, logSet, restoreSets, undoCopy } from './actions';
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
    expect(copied.sets.map((set) => set.id)).toEqual(target.sets.map((set) => set.id));
    expect(copied.created?.id).toBe(target.workouts[0]?.id);
    const ids = [...target.workouts, ...target.sets].map((row) => row.id);
    expect(await groupsOf(ids)).toHaveLength(1);
  });

  it('undoes a copy: its sets and the workout it created, unless that got other sets', async () => {
    await seedDay('2026-10-01', [{ weight_kg: 20 }]);
    await undoCopy(await copyDay('2026-10-01', '2026-10-04', false));
    expect(await dayData('2026-10-04')).toEqual({ workouts: [], sets: [] });

    const copy = await copyDay('2026-10-01', '2026-10-05', false);
    const [added] = await addExercise('2026-10-05', makeExercise());
    await undoCopy(copy);
    const kept = await dayData('2026-10-05');
    expect(kept.workouts.map((row) => row.id)).toEqual([copy.created?.id]);
    expect(kept.sets.map((set) => set.id)).toEqual([added?.id]);
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

  it('logs the planned set as done and starts its workout', async () => {
    const { workout, rows } = await seedDay('2026-11-01', [{ status: 'planned' }, {}]);
    const now = new Date('2026-11-01T17:30:00Z');
    const draft = { weight_kg: 22, reps: 9, duration_s: null, warmup: false, rir: 1 };
    const set = await logSet('2026-11-01', press.id, rows[0] ?? null, draft, now);

    const day = await dayData('2026-11-01');
    expect(day.sets.find((row) => row.id === set.id)).toMatchObject({
      status: 'done',
      weight_kg: 22,
      reps: 9,
      rir: 1,
      performed_at: now.toISOString(),
      position: 0,
    });
    expect(day.workouts.find((row) => row.id === workout.id)?.started_at).toBe(now.toISOString());
  });

  it('logs a new set on an empty day: its workout and the set in one group', async () => {
    await seedDay('2026-10-01', []);
    const draft = { weight_kg: 0, reps: 8, duration_s: null, warmup: true, rir: null };
    const set = await logSet('2026-11-02', press.id, null, draft);

    const day = await dayData('2026-11-02');
    expect(day.sets).toMatchObject([{ id: set.id, status: 'done', warmup: true, position: 0 }]);
    expect(day.workouts[0]?.started_at).toBe(set.performed_at);
    expect(await groupsOf([set.id, ...day.workouts.map((row) => row.id)])).toHaveLength(1);
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

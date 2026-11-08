import { newId, workoutSchema, type WorkoutLabel, type WorkoutSet } from '@liftwise/core';
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { db } from '../db/database';
import { applyLocal } from '../db/mutate';
import { makeExercise, makeSet, resetDb } from '../testing';
import {
  addExercise,
  copyDay,
  deleteDay,
  deleteSets,
  logSet,
  restoreDay,
  restoreSets,
  saveLabel,
  setDayLabel,
  undoCopy,
} from './actions';
import { dayData } from './queries';

const press = makeExercise({ weight_step_kg: 2 });
const label = (name: string): WorkoutLabel => ({
  id: newId(),
  name,
  color: 'cobalt',
  archived: false,
});

async function seedDay(date: string, sets: Partial<WorkoutSet>[], labelId: string | null = null) {
  const workout = workoutSchema.parse({ id: newId(), date, label_id: labelId });
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

  it("gives a copy the source's label unless the day has one; undo takes it off", async () => {
    const [a, b] = [label('A'), label('B')];
    await saveLabel(a);
    await saveLabel(b);
    await seedDay('2026-10-01', [{ weight_kg: 20 }], a.id);
    const labelOf = async (date: string) => (await dayData(date)).workouts[0]?.label_id;

    expect((await copyDay('2026-10-01', '2026-10-04', false)).created?.label_id).toBe(a.id);
    expect(await labelOf('2026-10-04')).toBe(a.id);

    const { workout } = await seedDay('2026-10-05', [{ status: 'planned' }]);
    const copy = await copyDay('2026-10-01', '2026-10-05', false);
    expect(copy.labelled).toMatchObject({ before: { id: workout.id }, labelId: a.id });
    expect(await labelOf('2026-10-05')).toBe(a.id);
    await undoCopy(copy);
    expect(await labelOf('2026-10-05')).toBeNull();

    await seedDay('2026-10-06', [{ status: 'planned' }], b.id);
    expect((await copyDay('2026-10-01', '2026-10-06', false)).labelled).toBeNull();
    expect(await labelOf('2026-10-06')).toBe(b.id);
  });

  it('keeps a label picked after the copy; an archived label is not copied', async () => {
    const [a, b] = [label('A'), label('B')];
    await saveLabel(a);
    await saveLabel(b);
    await seedDay('2026-10-01', [{ weight_kg: 20 }], a.id);
    const labelOf = async (date: string) => (await dayData(date)).workouts[0]?.label_id;

    await seedDay('2026-10-05', [{ status: 'planned' }]);
    const copy = await copyDay('2026-10-01', '2026-10-05', false);
    await setDayLabel('2026-10-05', b.id);
    await undoCopy(copy);
    expect(await labelOf('2026-10-05')).toBe(b.id);

    await saveLabel({ ...a, archived: true });
    expect((await copyDay('2026-10-01', '2026-10-06', false)).created?.label_id).toBeNull();
  });

  it('labels every workout of a day; a new label goes to the day in the same group', async () => {
    const first = await seedDay('2026-10-01', [{}]);
    const second = await seedDay('2026-10-01', [{}]);
    const a = label('A');
    await saveLabel(a, '2026-10-01');
    const labels = async () => (await dayData('2026-10-01')).workouts.map((w) => w.label_id);
    expect(await labels()).toEqual([a.id, a.id]);
    const written = (await db.outbox.toArray()).slice(-3);
    expect(written.map((entry) => entry.entityId).sort()).toEqual(
      [a.id, first.workout.id, second.workout.id].sort(),
    );
    expect(new Set(written.map((entry) => entry.mutation.groupId)).size).toBe(1);

    await setDayLabel('2026-10-01', null);
    expect(await labels()).toEqual([null, null]);
    await setDayLabel('2026-10-02', a.id);
    expect(await dayData('2026-10-02')).toEqual({ workouts: [], sets: [] });
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

  it('deletes every workout of a day with its sets in one group; undo writes them back', async () => {
    const a = label('A');
    await saveLabel(a);
    const first = await seedDay('2026-10-01', [{ status: 'done' }, {}], a.id);
    const second = await seedDay('2026-10-01', [{}]);
    await seedDay('2026-10-02', [{}]);
    const before = await dayData('2026-10-01');

    const deleted = await deleteDay('2026-10-01');
    expect(await dayData('2026-10-01')).toEqual({ workouts: [], sets: [] });
    expect((await dayData('2026-10-02')).sets).toHaveLength(1);
    const deletes = (await db.outbox.toArray()).filter((entry) => entry.mutation.op === 'delete');
    expect(deletes.map((entry) => entry.entityId).sort()).toEqual(
      [first.workout, second.workout, ...first.rows, ...second.rows].map((row) => row.id).sort(),
    );
    expect(new Set(deletes.map((entry) => entry.mutation.groupId))).toHaveLength(1);

    await restoreDay(deleted);
    const restored = await dayData('2026-10-01');
    const ids = (rows: { id: string }[]) => rows.map((row) => row.id).sort();
    expect(ids(restored.workouts)).toEqual(ids(before.workouts));
    expect(ids(restored.sets)).toEqual(ids(before.sets));
    expect(restored.workouts.find((row) => row.id === first.workout.id)?.label_id).toBe(a.id);
  });

  it('deletes an empty labelled workout; a day without one writes nothing', async () => {
    const a = label('A');
    await saveLabel(a);
    await seedDay('2026-10-01', [], a.id);
    await deleteDay('2026-10-01');
    expect((await dayData('2026-10-01')).workouts).toEqual([]);

    const queued = await db.outbox.count();
    expect(await deleteDay('2026-10-03')).toEqual({ workouts: [], sets: [] });
    expect(await db.outbox.count()).toBe(queued);
  });
});

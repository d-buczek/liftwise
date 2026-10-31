import { newId } from '@liftwise/core';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import {
  call,
  createDevice,
  db,
  pull,
  push,
  remove,
  setRow,
  upsert,
  workoutRow,
} from '../test/helpers';
import { changeLog, sets, workouts } from './db/schema';

let token: string;
beforeEach(async () => {
  ({ token } = await createDevice());
});

const undo = (groupId: string, json?: unknown) =>
  call(`/api/changes/${groupId}/undo`, { method: 'POST', token, json });

const setById = async (id: string) => (await db().select().from(sets).where(eq(sets.id, id)))[0];

// A workout with one set, created as one group.
async function createWorkout() {
  const workout = workoutRow();
  const set = setRow(workout.id);
  const groupId = newId();
  await push(token, [upsert('workouts', workout, groupId), upsert('sets', set, groupId)]);
  return { workout, set, groupId };
}

describe('undo', () => {
  it('removes what the group created, as a new synced group', async () => {
    const { workout, set, groupId } = await createWorkout();

    const response = await undo(groupId);
    expect(response.status).toBe(200);
    const { groupId: undoId } = await response.json<{ groupId: string }>();

    expect((await setById(set.id))?.deleted_at).not.toBeNull();
    const [row] = await db().select().from(workouts).where(eq(workouts.id, workout.id));
    expect(row?.deleted_at).not.toBeNull();

    const entries = await db()
      .select()
      .from(changeLog)
      .where(eq(changeLog.change_group_id, undoId));
    expect(entries.map(({ op, undo_of }) => ({ op, undo_of }))).toEqual([
      { op: 'delete', undo_of: groupId },
      { op: 'delete', undo_of: groupId },
    ]);
    const { changes } = await pull(token);
    expect(changes.filter(({ row }) => row.deleted_at !== null)).toHaveLength(2);
  });

  it('restores an edit and a delete', async () => {
    const { set } = await createWorkout();
    const groupId = newId();
    await push(token, [upsert('sets', { ...set, weight_kg: 25 }, groupId)]);
    await undo(groupId);
    expect(await setById(set.id)).toMatchObject({ weight_kg: 20, deleted_at: null });

    const deleteId = newId();
    await push(token, [remove('sets', set.id, deleteId)]);
    await undo(deleteId);
    expect(await setById(set.id)).toMatchObject({ weight_kg: 20, deleted_at: null });
  });

  it('can undo an undo', async () => {
    const { set } = await createWorkout();
    const groupId = newId();
    await push(token, [upsert('sets', { ...set, reps: 8 }, groupId)]);

    const { groupId: undoId } = await (await undo(groupId)).json<{ groupId: string }>();
    expect((await setById(set.id))?.reps).toBe(10);
    expect((await undo(undoId)).status).toBe(200);
    expect((await setById(set.id))?.reps).toBe(8);
  });

  it('asks for confirmation when a record changed after the group', async () => {
    const { workout, set } = await createWorkout();
    const groupId = newId();
    await push(token, [
      upsert('workouts', { ...workout, note: 'Plan' }, groupId),
      upsert('sets', { ...set, reps: 12 }, groupId),
    ]);
    await push(token, [upsert('sets', { ...set, reps: 6 })]);

    const conflict = await undo(groupId);
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({
      error: 'conflict',
      conflicts: [{ entity: 'sets', id: set.id }],
    });
    expect((await setById(set.id))?.reps).toBe(6);

    expect((await undo(groupId, { confirm: true })).status).toBe(200);
    expect((await setById(set.id))?.reps).toBe(10);
  });

  it('undoes a group once and names its undo on a retry', async () => {
    const { groupId } = await createWorkout();
    const { groupId: undoId } = await (await undo(groupId)).json<{ groupId: string }>();
    const again = await undo(groupId);
    expect(again.status).toBe(409);
    expect(await again.json()).toEqual({ error: 'already_undone', groupId: undoId });
  });

  it('applies one of two concurrent undos', async () => {
    const { groupId } = await createWorkout();
    const responses = await Promise.all([undo(groupId), undo(groupId)]);
    const bodies = await Promise.all(
      responses.map((response) => response.json<{ groupId: string }>()),
    );
    expect(responses.map((response) => response.status).toSorted((a, b) => a - b)).toEqual([
      200, 409,
    ]);
    expect(bodies[0]?.groupId).toBe(bodies[1]?.groupId);

    const entries = await db().select().from(changeLog).where(eq(changeLog.undo_of, groupId));
    expect(entries).toHaveLength(2);
  });

  it('returns no group when there is nothing to revert', async () => {
    const workout = workoutRow();
    const groupId = newId();
    await push(token, [
      upsert('workouts', workout, groupId),
      remove('workouts', workout.id, groupId),
    ]);

    for (let i = 0; i < 2; i++) {
      const response = await undo(groupId);
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ groupId: null });
    }
  });

  it('returns 404 for unknown groups', async () => {
    const response = await undo(newId());
    expect(response.status).toBe(404);
  });
});

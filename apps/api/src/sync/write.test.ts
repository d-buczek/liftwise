import { newId } from '@liftwise/core';
import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vite-plus/test';
import { db, repsExercise, setRow, workoutRow } from '../../test/helpers';
import { changeLog, sets } from '../db/schema';
import { applyWrites, InvalidWrite, type Write } from './write';

const upsert = (entity: Write['entity'], row: Write['row'], groupId: string): Write => ({
  groupId,
  entity,
  op: 'upsert',
  row,
});

describe('server writes', () => {
  it('logs the agent, the thread and the group of each change', async () => {
    const [group, threadId] = [newId(), newId()];
    const workout = workoutRow();
    const set = setRow(workout.id, { status: 'done', performed_at: '2026-10-31T18:00:00Z' });
    const changes = await applyWrites(db(), { actor: 'agent', threadId }, [
      upsert('workouts', workout, group),
      upsert('sets', set, group),
    ]);
    expect(changes.map((change) => change.entity)).toEqual(['workouts', 'sets']);
    const log = await db().select().from(changeLog).where(eq(changeLog.change_group_id, group));
    expect(log).toHaveLength(2);
    expect(log.every((entry) => entry.actor === 'agent' && entry.thread_id === threadId)).toBe(
      true,
    );
    // Core defaults fill what the row leaves out.
    const [stored] = await db().select().from(sets).where(eq(sets.id, set.id));
    expect(stored).toMatchObject({ rir: null, warmup: false, note: '' });
  });

  it('rejects an invalid row or reference and writes nothing', async () => {
    const group = newId();
    const workout = workoutRow();
    const write = (row: Write['row']) =>
      applyWrites(db(), { actor: 'agent' }, [
        upsert('workouts', workout, group),
        upsert('sets', row, group),
      ]);
    await expect(write(setRow(workout.id, { reps: null }))).rejects.toThrow(InvalidWrite);
    await expect(write(setRow(newId(), { exercise_id: repsExercise.id }))).rejects.toThrow(
      InvalidWrite,
    );
    expect(await db().select().from(changeLog)).toHaveLength(0);
  });
});

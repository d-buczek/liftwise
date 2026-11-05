import { newId } from '@liftwise/core';
import { asc, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vite-plus/test';
import { db, lastSeq, repsExercise, setRow, workoutRow } from '../../test/helpers';
import { changeLog, sets, workouts } from '../db/schema';
import {
  changeStatements,
  domainFields,
  loadRows,
  runBatch,
  sameState,
  withoutSeq,
  type Change,
  type Row,
  type StoredRow,
} from './apply';
import { applyWrites, type Write } from './write';

const AT = '2026-10-31T17:00:00.000Z';
const LATER = '2026-10-31T18:00:00.000Z';

const row = (fields: Record<string, unknown> = {}): Row => ({
  id: 'w1',
  date: '2026-10-31',
  created_at: AT,
  updated_at: AT,
  deleted_at: null,
  ...fields,
});

const workoutChange = (after: Row, before: StoredRow | null = null): Change => ({
  groupId: 'g',
  entity: 'workouts',
  before,
  after: {
    ...domainFields('workouts', { note: '', ...after }),
    id: after.id,
    created_at: after.created_at,
    updated_at: after.updated_at,
    deleted_at: after.deleted_at,
  },
});

const write = (
  entity: Write['entity'],
  fields: Write['row'],
  op: Write['op'] = 'upsert',
): Write => ({
  groupId: newId(),
  entity,
  op,
  row: fields,
});

describe('domainFields', () => {
  it('has every domain column and nothing else, absent ones as null', () => {
    const fields = domainFields('exercises', {
      ...repsExercise,
      seq: 7,
      created_at: AT,
      updated_at: AT,
      deleted_at: AT,
      invented: true,
    });
    expect(fields).toMatchObject({
      id: repsExercise.id,
      rep_range: repsExercise.rep_range,
      time_range_s: null,
    });
    for (const key of ['seq', 'created_at', 'updated_at', 'deleted_at', 'invented']) {
      expect(fields).not.toHaveProperty(key);
    }
  });
});

describe('sameState', () => {
  it('ignores the sync fields and the order of the keys', () => {
    const a = row({ note: 'x', label_id: null });
    const b = { updated_at: LATER, note: 'x', id: 'w1', created_at: LATER, date: '2026-10-31' };
    expect(sameState('workouts', a, { ...b, deleted_at: null } as Row)).toBe(true);
  });

  it('tells a tombstone from a live row, whatever its time', () => {
    const tombstone = row({ deleted_at: LATER });
    expect(sameState('workouts', row(), tombstone)).toBe(false);
    expect(sameState('workouts', tombstone, row({ deleted_at: AT }))).toBe(true);
  });

  it('sees a change in a field, also nested in JSON', () => {
    const first = { ...repsExercise, created_at: AT, updated_at: AT, deleted_at: null };
    const changed = { ...first, rep_range: { min: 6, max: 13 } };
    expect(sameState('exercises', first as Row, first as Row)).toBe(true);
    expect(sameState('exercises', first as Row, changed as Row)).toBe(false);
  });
});

describe('loadRows', () => {
  it('answers no rows without a query', async () => {
    expect(await loadRows(db(), [])).toEqual(new Map());
  });

  it('finds rows per table, tombstones included, by entity and id', async () => {
    const [live, deleted] = [workoutRow(), workoutRow()];
    await applyWrites(db(), { actor: 'user' }, [
      write('workouts', live),
      write('workouts', deleted),
      write('workouts', { id: deleted.id }, 'delete'),
    ]);

    const rows = await loadRows(db(), [
      ['workouts', live.id],
      ['workouts', live.id],
      ['workouts', deleted.id],
      ['workouts', newId()],
      ['exercises', repsExercise.id],
      // The same id in another table is another row.
      ['sets', live.id],
    ]);

    expect([...rows.keys()].sort()).toEqual(
      [`workouts/${live.id}`, `workouts/${deleted.id}`, `exercises/${repsExercise.id}`].sort(),
    );
    expect(rows.get(`workouts/${deleted.id}`)?.deleted_at).toEqual(expect.any(String));
    expect(rows.get(`exercises/${repsExercise.id}`)?.seq).toEqual(expect.any(Number));
  });
});

describe('changeStatements', () => {
  const logged = () => db().select().from(changeLog).orderBy(asc(changeLog.seq));

  it('keeps created_at of a row it overwrites', async () => {
    const created = row();
    await runBatch(db(), changeStatements(db(), { actor: 'user' }, [workoutChange(created)], AT));
    const updated = row({ created_at: LATER, updated_at: LATER, note: 'Po' });
    await runBatch(
      db(),
      changeStatements(
        db(),
        { actor: 'user' },
        [workoutChange(updated, { ...created, seq: 1 })],
        LATER,
      ),
    );

    const [stored] = await db().select().from(workouts).where(eq(workouts.id, 'w1'));
    expect(stored).toMatchObject({ created_at: AT, updated_at: LATER, note: 'Po' });
  });

  it('gives each change the next seq, across tables, and logs the same one', async () => {
    const since = await lastSeq();
    const workout = workoutRow();
    const set = setRow(workout.id);
    await applyWrites(db(), { actor: 'user' }, [write('workouts', workout), write('sets', set)]);

    expect(await lastSeq()).toBe(since + 2);
    const [storedWorkout] = await db().select().from(workouts).where(eq(workouts.id, workout.id));
    const [storedSet] = await db().select().from(sets).where(eq(sets.id, set.id));
    expect([storedWorkout?.seq, storedSet?.seq]).toEqual([since + 1, since + 2]);
    expect((await logged()).map((entry) => [entry.entity, entry.seq])).toEqual([
      ['workouts', since + 1],
      ['sets', since + 2],
    ]);
  });

  it('logs the actor, the thread and the undo, the snapshots without seq', async () => {
    const workout = workoutRow();
    const threadId = newId();
    await applyWrites(db(), { actor: 'system' }, [write('workouts', workout)]);
    const [stored] = (await loadRows(db(), [['workouts', workout.id]])).values();
    const after = { ...withoutSeq(stored as StoredRow), note: 'Po', updated_at: LATER };
    await runBatch(
      db(),
      changeStatements(
        db(),
        { actor: 'agent', threadId, undoOf: 'g0' },
        [{ groupId: 'g1', entity: 'workouts', before: stored as StoredRow, after }],
        LATER,
      ),
    );

    const [first, second] = await logged();
    expect(first).toMatchObject({
      actor: 'system',
      thread_id: null,
      undo_of: null,
      op: 'upsert',
      before: null,
    });
    expect(second).toMatchObject({
      change_group_id: 'g1',
      actor: 'agent',
      thread_id: threadId,
      undo_of: 'g0',
      entity_id: workout.id,
      created_at: LATER,
      after: { note: 'Po' },
    });
    expect(second?.before).toMatchObject({ id: workout.id, note: '' });
    expect(second?.before).not.toHaveProperty('seq');
  });

  it('logs a delete only when a live row dies; coming back is an upsert', async () => {
    const workout = workoutRow();
    await applyWrites(db(), { actor: 'user' }, [
      write('workouts', workout),
      write('workouts', { id: workout.id }, 'delete'),
      // The second delete changes nothing and isn't logged.
      write('workouts', { id: workout.id }, 'delete'),
      write('workouts', workout),
    ]);
    expect((await logged()).map((entry) => entry.op)).toEqual(['upsert', 'delete', 'upsert']);
    const [stored] = await db().select().from(workouts).where(eq(workouts.id, workout.id));
    expect(stored?.deleted_at).toBeNull();
  });

  it('logs an upsert for a tombstone that stays one, as an undo can write', async () => {
    const tombstone = row({ deleted_at: AT });
    const after = row({ deleted_at: AT, note: 'Po', updated_at: LATER });
    await runBatch(
      db(),
      changeStatements(
        db(),
        { actor: 'user' },
        [workoutChange(after, { ...tombstone, seq: 1 })],
        LATER,
      ),
    );
    expect(await logged()).toMatchObject([{ op: 'upsert' }]);
  });

  it('applies a batch whole or not at all (§6.4)', async () => {
    const since = await lastSeq();
    const [first, second] = [workoutRow(), workoutRow()];
    const meta = { actor: 'agent' as const, undoOf: 'g0' };
    const changeOf = (fields: typeof first) => workoutChange(row(fields));
    // The second one breaks the unique index on `undo_of` + entity + id.
    const statements = changeStatements(
      db(),
      meta,
      [changeOf(first), changeOf(second), changeOf(second)],
      AT,
    );

    await expect(runBatch(db(), statements)).rejects.toThrow(/UNIQUE constraint failed/);

    expect(await lastSeq()).toBe(since);
    expect(await db().select().from(workouts)).toEqual([]);
    expect(await logged()).toEqual([]);
  });

  it('never shares a seq between concurrent batches', async () => {
    const since = await lastSeq();
    const rows = Array.from({ length: 8 }, () => workoutRow());
    await Promise.all(
      rows.map((workout) => applyWrites(db(), { actor: 'user' }, [write('workouts', workout)])),
    );

    const seqs = (await db().select({ seq: workouts.seq }).from(workouts)).map(({ seq }) => seq);
    expect(new Set(seqs).size).toBe(rows.length);
    expect(await lastSeq()).toBe(since + rows.length);
  });
});

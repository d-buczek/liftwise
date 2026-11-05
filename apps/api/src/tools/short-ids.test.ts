import { newId, seedCatalog, shortId, type WriteToolOutput } from '@liftwise/core';
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { createDevice, repsExercise } from '../../test/helpers';
import { done, pushDay, runNamed } from '../../test/tools';

// The tools take the short ids the model sees (D55), next to the full ones.

const DAY = '2026-10-28';

// A valid id ending like another one.
const endingLike = (id: string) => `${newId().slice(0, -8)}${id.slice(-8)}`;

let token: string;
beforeEach(async () => {
  ({ token } = await createDevice());
});

const doneDay = async (...ids: string[]) =>
  pushDay(
    token,
    DAY,
    ids.map((id) => done({ id })),
  );

describe('a set by its short id', () => {
  it('is changed by update_set', async () => {
    const id = newId();
    await doneDay(id);
    const result = await runNamed<WriteToolOutput>('update_set', {
      set_id: shortId(id),
      weight_kg: 22,
    });
    expect(result.changes[0]).toMatchObject({ id, after: { weight_kg: 22 } });
  });

  it('is found with a lost leading zero, or in capitals', async () => {
    const id = `${newId().slice(0, -8)}0ab1ee45`;
    await doneDay(id);
    for (const [set_id, reps] of [
      ['ab1ee45', 8],
      ['0AB1EE45', 9],
    ] as const) {
      const result = await runNamed<WriteToolOutput>('update_set', { set_id, reps });
      expect(result.changes[0]).toMatchObject({ id, after: { reps } });
    }
  });

  it('is proposed by update_sets and delete_sets, with the changes of the full ids', async () => {
    const [first, second] = [newId(), newId()];
    await doneDay(first, second);
    const updated = await runNamed<{ status: string; changes: { id: string }[] }>('update_sets', {
      updates: [
        { set_id: shortId(first), weight_kg: 22 },
        { set_id: shortId(second), weight_kg: 22 },
        { set_id: first, reps: 8 },
      ],
    });
    expect(updated.status).toBe('pending');
    expect(updated.changes.map((change) => change.id).sort()).toEqual([first, second].sort());

    const deleted = await runNamed<{ status: string; changes: { id: string }[] }>('delete_sets', {
      set_ids: [shortId(first)],
    });
    expect(deleted.changes.map((change) => change.id)).toEqual([first]);
  });

  it('is not guessed when two sets end alike', async () => {
    const id = newId();
    await doneDay(id, endingLike(id));
    expect(await runNamed('update_set', { set_id: shortId(id), weight_kg: 22 })).toEqual({
      error: 'ambiguous_id',
      id: shortId(id),
    });
    expect(await runNamed('delete_sets', { set_ids: [id] })).toMatchObject({ status: 'pending' });
  });

  it.each(['%%%%%%', '______', 'abc', ''])('finds nothing by "%s"', async (set_id) => {
    await doneDay(newId());
    expect(await runNamed('update_set', { set_id, weight_kg: 22 })).toMatchObject({
      error: 'set_not_found',
    });
  });

  it('is planned on by edit_planned_sets: updated and removed', async () => {
    const [changed, removed] = [newId(), newId()];
    await pushDay(token, DAY, [
      { id: changed, status: 'planned' },
      { id: removed, status: 'planned' },
    ]);
    const result = await runNamed<WriteToolOutput>('edit_planned_sets', {
      date: DAY,
      update: [
        { set_id: shortId(changed), weight_kg: 22 },
        { set_id: changed, reps: 8 },
      ],
      remove: [shortId(removed)],
    });
    const change = (id: string) => result.changes.find((row) => row.id === id);
    expect(change(changed)).toMatchObject({ op: 'update', after: { weight_kg: 22, reps: 8 } });
    expect(change(removed)).toMatchObject({ op: 'delete' });
  });

  it('removes a set an update touched too, once', async () => {
    const id = newId();
    await pushDay(token, DAY, [{ id, status: 'planned' }]);
    const result = await runNamed<WriteToolOutput>('edit_planned_sets', {
      date: DAY,
      update: [{ set_id: shortId(id), weight_kg: 22 }],
      remove: [id],
    });
    expect(result.changes).toHaveLength(1);
    expect(result.changes[0]).toMatchObject({ id, op: 'delete' });
  });
});

describe('a change group by its short id', () => {
  it('is undone by undo_change', async () => {
    const logged = await runNamed<WriteToolOutput>('log_sets', {
      exercise_id: repsExercise.id,
      sets: [{ weight_kg: 20, reps: 10 }],
    });
    const undone = await runNamed<WriteToolOutput>('undo_change', {
      group_id: shortId(logged.groupId!),
    });
    expect(undone.groupId).toBeTruthy();
    expect(undone.changes.map((change) => change.op)).toContain('delete');
  });

  it('stays not_found when no group ends like it', async () => {
    expect(await runNamed('undo_change', { group_id: 'abcdef12' })).toMatchObject({
      error: 'not_found',
    });
  });
});

describe('an exercise by its short id', () => {
  const other = seedCatalog().find(
    (row) => row.id !== repsExercise.id && row.measure === repsExercise.measure,
  )!;

  it('is read and logged', async () => {
    await pushDay(token, DAY, [done({ exercise_id: repsExercise.id, weight_kg: 26 })]);
    const history = await runNamed<{ sessions: unknown[] }>('get_exercise_history', {
      exercise_id: shortId(repsExercise.id),
    });
    expect(history.sessions).toHaveLength(1);
    const records = await runNamed<{ records: unknown }>('get_records', {
      exercise_id: shortId(repsExercise.id),
    });
    expect(records).not.toHaveProperty('error');
    const logged = await runNamed<WriteToolOutput>('log_sets', {
      exercise_id: shortId(repsExercise.id),
      sets: [{ weight_kg: 20, reps: 10 }],
    });
    expect(logged.changes.at(-1)).toMatchObject({ after: { exercise_id: repsExercise.id } });
  });

  it('is swapped in edit_planned_sets, on both sides', async () => {
    await pushDay(token, DAY, [{ exercise_id: repsExercise.id, status: 'planned' }]);
    const result = await runNamed<WriteToolOutput>('edit_planned_sets', {
      date: DAY,
      swap: [{ exercise_id: shortId(repsExercise.id), to_exercise_id: shortId(other.id) }],
    });
    expect(result.changes[0]).toMatchObject({ after: { exercise_id: other.id } });
  });
});

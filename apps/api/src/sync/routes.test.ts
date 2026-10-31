import { newId, type SyncPushResponse } from '@liftwise/core';
import { asc, eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import {
  call,
  createDevice,
  db,
  lastSeq,
  pull,
  push,
  remove,
  repsExercise,
  setRow,
  timedExercise,
  upsert,
  workoutRow,
} from '../../test/helpers';
import { appliedMutations, changeLog, sets } from '../db/schema';

let token: string;
beforeEach(async () => {
  ({ token } = await createDevice());
});

const statuses = async (response: Response) =>
  (await response.json<SyncPushResponse>()).results.map((result) => result.status);

const logOf = (entityId: string) =>
  db()
    .select()
    .from(changeLog)
    .where(eq(changeLog.entity_id, entityId))
    .orderBy(asc(changeLog.seq));

describe('sync push', () => {
  it('writes rows with fresh seqs and logs them', async () => {
    const since = await lastSeq();
    const workout = workoutRow();
    const set = setRow(workout.id);
    const groupId = newId();

    const response = await push(token, [
      upsert('workouts', workout, groupId),
      upsert('sets', set, groupId),
    ]);
    expect(response.status).toBe(200);
    expect(await statuses(response)).toEqual(['applied', 'applied']);

    const { changes } = await pull(token, since);
    expect(changes.map(({ entity, row }) => [entity, row.id, row.seq])).toEqual([
      ['workouts', workout.id, since + 1],
      ['sets', set.id, since + 2],
    ]);
    expect(changes[1]?.row).toMatchObject({ warmup: false, note: '', deleted_at: null });

    const [entry] = await logOf(set.id);
    expect(entry).toMatchObject({ change_group_id: groupId, actor: 'user', op: 'upsert' });
    expect(entry?.before).toBeNull();
    expect(entry?.after).toMatchObject({ weight_kg: 20, reps: 10 });
    expect(entry?.seq).toBe(since + 2);
  });

  it('updates a row and keeps what it was before', async () => {
    const workout = workoutRow();
    const set = setRow(workout.id);
    await push(token, [upsert('workouts', workout), upsert('sets', set)]);
    const created = (await pull(token)).changes.find(({ row }) => row.id === set.id)?.row;

    await push(token, [upsert('sets', { ...set, weight_kg: 22.5 })]);
    const updated = (await pull(token, created?.seq)).changes[0]?.row;
    expect(updated).toMatchObject({ id: set.id, weight_kg: 22.5, created_at: created?.created_at });

    const [, entry] = await logOf(set.id);
    expect(entry?.before).toMatchObject({ weight_kg: 20 });
    expect(entry?.after).toMatchObject({ weight_kg: 22.5 });
  });

  it('deletes with a tombstone and brings it back on a later upsert', async () => {
    const workout = workoutRow();
    await push(token, [upsert('workouts', workout)]);
    const since = await lastSeq();

    await push(token, [remove('workouts', workout.id)]);
    const [tombstone] = (await pull(token, since)).changes;
    expect(tombstone?.row.deleted_at).not.toBeNull();
    expect((await logOf(workout.id)).map((entry) => entry.op)).toEqual(['upsert', 'delete']);

    await push(token, [upsert('workouts', { ...workout, note: 'Jednak był' })]);
    const [back] = (await pull(token, since + 1)).changes;
    expect(back?.row).toMatchObject({ deleted_at: null, note: 'Jednak był' });
  });

  it('skips writes that change nothing', async () => {
    const workout = workoutRow();
    await push(token, [upsert('workouts', workout)]);
    const since = await lastSeq();

    const response = await push(token, [
      upsert('workouts', workout),
      remove('workouts', newId()),
      remove('sets', newId()),
    ]);
    expect(await statuses(response)).toEqual(['applied', 'applied', 'applied']);
    expect(await lastSeq()).toBe(since);
    expect(await logOf(workout.id)).toHaveLength(1);
  });

  it('applies a retried push only once', async () => {
    const workout = workoutRow();
    const first = upsert('workouts', workout);
    expect(await statuses(await push(token, [first]))).toEqual(['applied']);

    const edit = upsert('workouts', { ...workout, note: 'Po' });
    expect(await statuses(await push(token, [first, edit]))).toEqual(['duplicate', 'applied']);
    expect(await statuses(await push(token, [first, edit]))).toEqual(['duplicate', 'duplicate']);
    expect(await logOf(workout.id)).toHaveLength(2);
    expect(await db().select().from(appliedMutations)).toHaveLength(2);
  });

  it('rejects the whole push when a row is invalid', async () => {
    const workout = workoutRow();
    const response = await push(token, [
      upsert('workouts', workout),
      upsert('sets', setRow(workout.id, { reps: null })),
    ]);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_mutation', index: 1 });
    expect(await logOf(workout.id)).toHaveLength(0);
  });

  it('checks what a set refers to', async () => {
    const workout = workoutRow();
    const deleted = workoutRow();
    await push(token, [upsert('workouts', deleted), remove('workouts', deleted.id)]);

    // The workout earlier in the same push and a tombstoned one both count.
    const valid = await push(token, [
      upsert('workouts', workout),
      upsert('sets', setRow(workout.id)),
      upsert('sets', setRow(deleted.id)),
      upsert(
        'sets',
        setRow(workout.id, { exercise_id: timedExercise.id, reps: null, duration_s: 45 }),
      ),
    ]);
    expect(valid.status).toBe(200);

    const invalid = [
      setRow(newId()),
      setRow(workout.id, { exercise_id: newId() }),
      setRow(workout.id, { exercise_id: timedExercise.id }),
      setRow(workout.id, { exercise_id: repsExercise.id, reps: null, duration_s: 45 }),
    ];
    for (const set of invalid) {
      const response = await push(token, [upsert('workouts', workoutRow()), upsert('sets', set)]);
      expect(await response.json()).toEqual({ error: 'invalid_mutation', index: 1 });
    }
    expect(await db().select().from(sets)).toHaveLength(3);
  });

  it('rejects a malformed body', async () => {
    const response = await call('/api/sync/push', {
      method: 'POST',
      token,
      json: { mutations: 1 },
    });
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'invalid_request' });
  });
});

describe('sync pull', () => {
  it('returns rows in their core shape with sync fields', async () => {
    const { changes } = await pull(token, 0, 500);
    const timed = changes.find(({ row }) => row.id === timedExercise.id)?.row;
    expect(timed).toMatchObject({ measure: 'time', time_range_s: timedExercise.time_range_s });
    expect(timed).not.toHaveProperty('rep_range');
    expect(timed).toHaveProperty('seq');
  });

  it('pages through every table without gaps', async () => {
    const since = await lastSeq();
    const workouts = [workoutRow(), workoutRow(), workoutRow()];
    const mutations = workouts.flatMap((workout) => [
      upsert('workouts', workout),
      upsert('sets', setRow(workout.id)),
    ]);
    await push(token, mutations);

    const seen: number[] = [];
    let page = await pull(token, since, 2);
    seen.push(...page.changes.map(({ row }) => row.seq));
    while (page.hasMore) {
      page = await pull(token, page.seq, 2);
      seen.push(...page.changes.map(({ row }) => row.seq));
    }
    expect(seen).toEqual(mutations.map((_, i) => since + i + 1));
    expect(page.seq).toBe(since + mutations.length);

    const empty = await pull(token, page.seq);
    expect(empty).toEqual({ changes: [], seq: page.seq, hasMore: false });
  });

  it('rejects a bad cursor or limit', async () => {
    for (const query of ['since=-1', 'since=abc', 'limit=0', 'limit=501']) {
      const response = await call(`/api/sync/pull?${query}`, { token });
      expect(response.status).toBe(400);
    }
  });
});

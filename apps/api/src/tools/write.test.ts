import { newId, seedCatalog, SETTING_IDS, type WriteToolOutput } from '@liftwise/core';
import { eq } from 'drizzle-orm';
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
import { done, liveData, NOW, pushDay, runNamed, THREAD_ID, TODAY } from '../../test/tools';
import { changeLog, sets, workouts } from '../db/schema';
import { TOOLS } from '.';

const otherRepsExercise = seedCatalog().find(
  (exercise) => exercise.measure === 'reps' && exercise.id !== repsExercise.id,
)!;

const timed = (fields: Record<string, unknown> = {}) => ({
  exercise_id: timedExercise.id,
  weight_kg: 0,
  reps: null,
  duration_s: 45,
  ...fields,
});

const setById = async (id: unknown) =>
  (
    await db()
      .select()
      .from(sets)
      .where(eq(sets.id, id as string))
  )[0];

const logCount = async () => (await db().select().from(changeLog)).length;

// A call that must only answer with the reason: no change, no log row.
async function refused(name: string, input: unknown) {
  const [logged, before] = [await logCount(), await liveData()];
  const output = await runNamed<{ error: string }>(name, input);
  expect(await logCount()).toBe(logged);
  expect(await liveData()).toEqual(before);
  return output;
}

const opsOf = ({ changes }: WriteToolOutput) => changes.map(({ entity, op }) => `${entity}:${op}`);

let token: string;
beforeEach(async () => {
  ({ token } = await createDevice());
});

describe('every write tool', () => {
  type Fixture = Record<'past' | 'unstarted' | 'today', Awaited<ReturnType<typeof pushDay>>>;

  const WRITE_CALLS: Record<string, (fixture: Fixture) => unknown> = {
    log_sets: () => ({ exercise_id: repsExercise.id, sets: [{ weight_kg: 24, reps: 10, rir: 0 }] }),
    update_set: ({ past }) => ({ set_id: past.sets[0]?.id, weight_kg: 22.5, rir: 1 }),
    copy_workout: () => ({ from_date: '2026-10-28', to_date: '2026-11-02' }),
    edit_planned_sets: ({ today }) => ({
      date: TODAY,
      add: [{ exercise_id: timedExercise.id, sets: [{ weight_kg: 0, duration_s: 45 }] }],
      update: [{ set_id: today.sets[0]?.id, weight_kg: 22.5 }],
      remove: [today.sets[1]?.id],
    }),
    start_workout: () => ({ date: '2026-10-29' }),
    finish_workout: () => ({ date: '2026-10-28' }),
  };

  it('is listed, next to undo_change', () => {
    const names = TOOLS.filter((tool) => tool.risk === 'write').map((tool) => tool.name);
    expect([...Object.keys(WRITE_CALLS), 'undo_change'].sort()).toEqual(names.sort());
  });

  it.each(Object.keys(WRITE_CALLS))(
    '%s writes one agent group of the thread, which undo_change reverts',
    async (name) => {
      const fixture: Fixture = {
        past: await pushDay(token, '2026-10-28', [done(), { status: 'planned' }], {
          started_at: '2026-10-28T17:00:00+01:00',
        }),
        unstarted: await pushDay(token, '2026-10-29', [{ status: 'planned' }]),
        today: await pushDay(token, TODAY, [{ status: 'planned' }, { status: 'planned' }]),
      };
      const before = await liveData();

      const result = await runNamed<WriteToolOutput>(name, WRITE_CALLS[name]?.(fixture));

      expect(result.groupId).toEqual(expect.any(String));
      expect(result.changes.length).toBeGreaterThan(0);
      expect(await liveData()).not.toEqual(before);
      const group = await db()
        .select()
        .from(changeLog)
        .where(eq(changeLog.change_group_id, result.groupId ?? ''));
      expect(group.map(({ entity, entity_id }) => [entity, entity_id])).toEqual(
        result.changes.map(({ entity, id }) => [entity, id]),
      );
      expect(
        group.every(({ actor, thread_id }) => actor === 'agent' && thread_id === THREAD_ID),
      ).toBe(true);

      const undo = await runNamed<WriteToolOutput>('undo_change', { group_id: result.groupId });
      expect(undo.groupId).toEqual(expect.any(String));
      expect(await liveData()).toEqual(before);
      const reverted = await db()
        .select()
        .from(changeLog)
        .where(eq(changeLog.undo_of, result.groupId ?? ''));
      expect(reverted).toHaveLength(group.length);
      expect(
        reverted.every(
          ({ actor, thread_id, change_group_id }) =>
            actor === 'agent' && thread_id === THREAD_ID && change_group_id === undo.groupId,
        ),
      ).toBe(true);
    },
  );
});

describe('log_sets', () => {
  it('logs a past day on that day, at the weight precision, warm-up on warm-up', async () => {
    const {
      workout,
      sets: [warmup, working],
    } = await pushDay(token, '2026-10-28', [
      { status: 'planned', warmup: true, weight_kg: 10 },
      { status: 'planned', weight_kg: 20 },
    ]);

    const result = await runNamed<WriteToolOutput>('log_sets', {
      exercise_id: repsExercise.id,
      date: '2026-10-28',
      sets: [{ weight_kg: 10.1, reps: 12, warmup: true }],
    });

    expect(opsOf(result)).toEqual(['workouts:update', 'sets:update']);
    expect(result.changes[0]).toMatchObject({ id: workout.id, after: { started_at: NOW } });
    expect(result.changes[1]).toMatchObject({
      id: warmup?.id,
      after: { status: 'done', weight_kg: 10, reps: 12, warmup: true, performed_at: NOW },
    });
    expect(await setById(working?.id)).toMatchObject({ status: 'planned', performed_at: null });
  });

  it("doesn't log into a deleted workout of the day", async () => {
    const { workout } = await pushDay(token, TODAY, [{ status: 'planned' }]);
    await push(token, [remove('workouts', workout.id)]);

    const result = await runNamed<WriteToolOutput>('log_sets', {
      exercise_id: repsExercise.id,
      sets: [{ weight_kg: 20, reps: 10 }],
    });

    expect(opsOf(result)).toEqual(['workouts:create', 'sets:create']);
    expect(result.changes[0]?.id).not.toBe(workout.id);
    expect(result.changes[1]?.after).toMatchObject({ source: 'agent', position: 0 });
  });

  it('refuses what is missing or unknown', async () => {
    expect(
      await refused('log_sets', {
        exercise_id: repsExercise.id,
        sets: [{ weight_kg: 20, duration_s: 45 }],
      }),
    ).toEqual({ error: 'reps_missing', exercise: repsExercise.name_pl });
    expect(
      await refused('log_sets', { exercise_id: newId(), sets: [{ weight_kg: 20, reps: 10 }] }),
    ).toMatchObject({ error: 'exercise_not_found' });
  });
});

describe('update_set', () => {
  it('finds only live sets of live workouts', async () => {
    const {
      sets: [deleted],
    } = await pushDay(token, TODAY, [done()]);
    const { workout, sets: orphaned } = await pushDay(token, '2026-10-28', [done()]);
    await push(token, [remove('sets', deleted?.id as string), remove('workouts', workout.id)]);

    for (const id of [newId(), deleted?.id, orphaned[0]?.id]) {
      expect(await refused('update_set', { set_id: id, weight_kg: 22 })).toEqual({
        error: 'set_not_found',
        set_id: id,
      });
    }
  });

  it('changes the fields it gets and keeps the rest, in the measure of the exercise', async () => {
    const {
      sets: [set],
    } = await pushDay(token, TODAY, [done(timed({ rir: 2, note: 'Ściana' }))]);

    const result = await runNamed<WriteToolOutput>('update_set', {
      set_id: set?.id,
      weight_kg: 5.1,
      duration_s: 50,
    });

    expect(result.changes[0]?.after).toMatchObject({
      weight_kg: 5,
      duration_s: 50,
      reps: null,
      rir: 2,
      note: 'Ściana',
      status: 'done',
    });
  });

  it('reports a call that changes nothing, with no group to undo', async () => {
    const {
      sets: [set],
    } = await pushDay(token, TODAY, [done({ weight_kg: 20 })]);
    const logged = await logCount();
    expect(await runNamed('update_set', { set_id: set?.id, weight_kg: 20 })).toEqual({
      groupId: null,
      changes: [],
    });
    expect(await logCount()).toBe(logged);
  });

  // Bug: the value of the other measure is dropped silently; §6.6 wants an `error` for the model.
  it.fails('refuses reps for a set measured in time', async () => {
    const {
      sets: [set],
    } = await pushDay(token, TODAY, [done(timed())]);
    expect(await runNamed('update_set', { set_id: set?.id, reps: 12 })).toHaveProperty('error');
  });
});

describe('copy_workout', () => {
  const copied = (from_date: string, to_date: string, light?: boolean) =>
    runNamed<WriteToolOutput>('copy_workout', { from_date, to_date, light });

  it('refuses a day with nothing to copy', async () => {
    expect(
      await refused('copy_workout', { from_date: '2026-10-28', to_date: '2026-11-02' }),
    ).toEqual({ error: 'nothing_to_copy', date: '2026-10-28' });
  });

  it("appends planned sets after the target day's, in its workout", async () => {
    await pushDay(token, '2026-10-28', [done({ rir: 1 }), { status: 'planned' }]);
    const target = await pushDay(token, '2026-11-02', [
      { status: 'planned', exercise_id: otherRepsExercise.id },
      done({ position: 4 }),
    ]);

    const result = await copied('2026-10-28', '2026-11-02');

    // Done source sets only, none of what they recorded.
    expect(opsOf(result)).toEqual(['sets:create']);
    expect(result.changes[0]?.after).toMatchObject({
      workout_id: target.workout.id,
      position: 5,
      status: 'planned',
      rir: null,
      performed_at: null,
      source: 'copy',
    });
  });

  it('copies lighter by the step of the training settings (D33)', async () => {
    await push(token, [
      upsert('settings', {
        id: SETTING_IDS.training,
        key: 'training',
        value: { rest_seconds: 120, target_rir: { min: 1, max: 2 }, weight_step_kg: 2.5 },
      }),
    ]);
    await pushDay(token, '2026-10-28', [done({ weight_kg: 40 }), done({ weight_kg: 40 })]);

    const result = await copied('2026-10-28', '2026-11-02', true);

    expect(result.changes.filter(({ entity }) => entity === 'sets')).toMatchObject([
      { after: { weight_kg: 35, reps: 10 } },
    ]);
  });

  it('carries the label to a new or unlabelled workout, unless own or archived (D48)', async () => {
    const [label, own] = [
      { id: newId(), name: 'A', color: 'teal' },
      { id: newId(), name: 'B', color: 'violet' },
    ];
    await push(token, [upsert('workout_labels', label), upsert('workout_labels', own)]);
    await pushDay(token, '2026-10-28', [done()], { label_id: label.id });

    const fresh = await copied('2026-10-28', '2026-11-02');
    expect(fresh.changes[0]).toMatchObject({
      entity: 'workouts',
      op: 'create',
      after: { label_id: label.id },
    });

    const plain = await pushDay(token, '2026-11-03', [{ status: 'planned' }]);
    const unlabelled = await copied('2026-10-28', '2026-11-03');
    expect(unlabelled.changes[0]).toMatchObject({
      entity: 'workouts',
      op: 'update',
      id: plain.workout.id,
      after: { label_id: label.id },
    });

    await pushDay(token, '2026-11-04', [{ status: 'planned' }], { label_id: own.id });
    expect(opsOf(await copied('2026-10-28', '2026-11-04'))).toEqual(['sets:create']);

    await push(token, [upsert('workout_labels', { ...label, archived: true })]);
    const archived = await copied('2026-10-28', '2026-11-05');
    expect(archived.changes[0]).toMatchObject({ op: 'create', after: { label_id: null } });
  });
});

describe('edit_planned_sets', () => {
  const edit = (input: Record<string, unknown>) =>
    runNamed<WriteToolOutput>('edit_planned_sets', { date: TODAY, ...input });

  const swapInput = {
    exercise_id: repsExercise.id,
    to_exercise_id: otherRepsExercise.id,
  };

  it('plans an added exercise from its last session, else at the bottom of its range', async () => {
    await pushDay(token, '2026-10-27', [
      done({ weight_kg: 10, reps: 12, warmup: true }),
      done({ weight_kg: 20, reps: 10, rir: 1 }),
      done({ weight_kg: 22.5, reps: 8 }),
      { status: 'planned', weight_kg: 40 },
    ]);

    const result = await edit({
      date: '2026-11-02',
      add: [{ exercise_id: repsExercise.id }, { exercise_id: timedExercise.id, sets: [] }],
    });

    expect(opsOf(result)).toEqual(['workouts:create', 'sets:create', 'sets:create', 'sets:create']);
    const planned = { status: 'planned', rir: null, performed_at: null, source: 'agent' };
    expect(result.changes.slice(1).map((change) => change.after)).toMatchObject([
      { ...planned, position: 0, exercise_id: repsExercise.id, weight_kg: 20, reps: 10 },
      { ...planned, position: 1, exercise_id: repsExercise.id, weight_kg: 22.5, reps: 8 },
      {
        ...planned,
        position: 2,
        exercise_id: timedExercise.id,
        weight_kg: 0,
        reps: null,
        duration_s: timedExercise.time_range_s?.min,
      },
    ]);
  });

  it('swaps the planned sets of an exercise, leaves done ones and combines edits', async () => {
    const {
      sets: [logged, first, second],
    } = await pushDay(token, TODAY, [done(), { status: 'planned' }, { status: 'planned' }]);

    const result = await edit({
      update: [{ set_id: first?.id, weight_kg: 22.5 }],
      swap: [swapInput],
      remove: [second?.id],
    });

    expect(opsOf(result)).toEqual(['sets:delete', 'sets:update']);
    expect(result.changes[1]).toMatchObject({
      id: first?.id,
      after: { exercise_id: otherRepsExercise.id, weight_kg: 22.5 },
    });
    // A set both swapped and removed stays removed.
    expect((await setById(second?.id))?.deleted_at).not.toBeNull();
    expect(await setById(logged?.id)).toMatchObject({
      exercise_id: repsExercise.id,
      status: 'done',
    });
  });

  it('refuses a swap to another measure or of an exercise not planned that day', async () => {
    await pushDay(token, TODAY, [done(), { status: 'planned' }]);
    expect(
      await refused('edit_planned_sets', {
        date: TODAY,
        swap: [{ exercise_id: repsExercise.id, to_exercise_id: timedExercise.id }],
      }),
    ).toEqual({
      error: 'measure_mismatch',
      exercise_id: repsExercise.id,
      to_exercise_id: timedExercise.id,
    });
    expect(
      await refused('edit_planned_sets', {
        date: TODAY,
        swap: [{ exercise_id: otherRepsExercise.id, to_exercise_id: repsExercise.id }],
      }),
    ).toEqual({ error: 'not_planned', exercise_id: otherRepsExercise.id });
  });

  it('writes nothing of a call with one bad edit', async () => {
    const {
      sets: [logged, planned],
    } = await pushDay(token, TODAY, [done(), { status: 'planned' }]);
    const elsewhere = await pushDay(token, '2026-11-02', [{ status: 'planned' }]);
    const good = {
      date: TODAY,
      add: [{ exercise_id: timedExercise.id, sets: [{ weight_kg: 0, duration_s: 45 }] }],
      remove: [planned?.id],
    };

    for (const set of [logged, elsewhere.sets[0], { id: newId() }]) {
      expect(
        await refused('edit_planned_sets', {
          ...good,
          update: [{ set_id: set?.id, weight_kg: 22.5 }],
        }),
      ).toEqual({ error: 'not_planned', set_id: set?.id });
    }
    expect(
      await refused('edit_planned_sets', { ...good, add: [{ exercise_id: newId() }] }),
    ).toMatchObject({ error: 'exercise_not_found' });
  });

  it('refuses an empty call', async () => {
    expect(await refused('edit_planned_sets', { date: TODAY })).toEqual({
      error: 'nothing_to_change',
    });
  });

  // Bug: `add` has no cap, loadRows binds every set id and D1 takes 100, so the call throws
  // `too many SQL variables` instead of returning an `error` (§6.6).
  it.fails('answers a call of more than 100 sets without throwing', async () => {
    const sets = Array.from({ length: 20 }, () => ({ weight_kg: 0, duration_s: 45 }));
    const add = Array.from({ length: 6 }, () => ({ exercise_id: timedExercise.id, sets }));
    await expect(edit({ add })).resolves.toBeDefined();
  });
});

describe('start_workout and finish_workout', () => {
  it('starts the planned workout of the day, and not on a future day', async () => {
    const { workout } = await pushDay(token, '2026-10-28', [{ status: 'planned' }]);
    const started = await runNamed<WriteToolOutput>('start_workout', { date: '2026-10-28' });
    expect(started.changes).toMatchObject([
      { entity: 'workouts', op: 'update', id: workout.id, after: { started_at: NOW } },
    ]);

    expect(await refused('start_workout', { date: '2026-11-01' })).toEqual({
      error: 'future_date',
      date: '2026-11-01',
      today: TODAY,
    });
  });

  it('finishes every open workout of the day as one group (D44)', async () => {
    const started_at = '2026-10-31T17:00:00+01:00';
    const [one, two] = [
      await pushDay(token, TODAY, [done()], { started_at }),
      await pushDay(token, TODAY, [done()], { started_at }),
    ];
    const finished = await pushDay(token, TODAY, [done()], {
      started_at,
      ended_at: '2026-10-31T17:30:00+01:00',
    });

    const result = await runNamed<WriteToolOutput>('finish_workout', {});

    expect(result.changes.map((change) => change.id).sort()).toEqual(
      [one.workout.id, two.workout.id].sort(),
    );
    expect(result.changes.every((change) => change.after?.ended_at === NOW)).toBe(true);
    const [kept] = await db().select().from(workouts).where(eq(workouts.id, finished.workout.id));
    expect(kept?.ended_at).toBe('2026-10-31T17:30:00+01:00');
  });

  it('refuses to finish a day with no open workout', async () => {
    const notStarted = { error: 'not_started', date: TODAY };
    expect(await refused('finish_workout', {})).toEqual(notStarted);

    await pushDay(token, TODAY, [{ status: 'planned' }]);
    expect(await refused('finish_workout', {})).toEqual(notStarted);

    await runNamed('start_workout', {});
    await runNamed('finish_workout', {});
    expect(await refused('finish_workout', {})).toEqual(notStarted);
  });
});

describe('undo_change', () => {
  it('refuses an unknown group', async () => {
    expect(await refused('undo_change', { group_id: newId() })).toEqual({ error: 'not_found' });
  });

  it('asks before overwriting a record changed since, and goes on with confirm', async () => {
    const {
      sets: [set],
    } = await pushDay(token, TODAY, [done({ weight_kg: 20 })]);
    const { groupId } = await runNamed<WriteToolOutput>('update_set', {
      set_id: set?.id,
      weight_kg: 22.5,
    });
    await push(token, [upsert('sets', { ...set, weight_kg: 25 })]);

    expect(await refused('undo_change', { group_id: groupId })).toEqual({
      error: 'conflict',
      conflicts: [{ entity: 'sets', id: set?.id }],
    });

    const undo = await runNamed<WriteToolOutput>('undo_change', {
      group_id: groupId,
      confirm: true,
    });
    expect(undo.changes).toMatchObject([{ before: { weight_kg: 25 }, after: { weight_kg: 20 } }]);
    expect((await setById(set?.id))?.weight_kg).toBe(20);
  });

  it('names the undo of a group undone before', async () => {
    const {
      sets: [set],
    } = await pushDay(token, TODAY, [done()]);
    const { groupId } = await runNamed<WriteToolOutput>('update_set', {
      set_id: set?.id,
      weight_kg: 22.5,
    });
    const undo = await runNamed<WriteToolOutput>('undo_change', { group_id: groupId });
    expect(await refused('undo_change', { group_id: groupId })).toEqual({
      error: 'already_undone',
      groupId: undo.groupId,
    });
  });

  it('answers without a group when there is nothing to revert', async () => {
    const workout = { id: newId(), date: TODAY };
    const groupId = newId();
    await push(token, [
      upsert('workouts', workout, groupId),
      remove('workouts', workout.id, groupId),
    ]);
    const logged = await logCount();
    expect(await runNamed('undo_change', { group_id: groupId })).toEqual({
      groupId: null,
      changes: [],
    });
    expect(await logCount()).toBe(logged);
  });
});

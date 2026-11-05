import {
  ATHLETE_PROFILE_ID,
  DEFAULT_BALANCE_SETTINGS,
  newId,
  SETTING_IDS,
  type ChangeView,
  type ProposalToolOutput,
  type WriteToolOutput,
} from '@liftwise/core';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import {
  createDevice,
  db,
  lastSeq,
  push,
  remove,
  repsExercise,
  setRow,
  timedExercise,
  upsert,
  workoutRow,
} from '../../test/helpers';
import {
  confirmProposal,
  done,
  liveData,
  pushDay,
  runNamed,
  THREAD_ID,
  TODAY,
} from '../../test/tools';
import { changeLog, exercises, pendingProposals, sets, settings } from '../db/schema';
import { TOOLS } from '.';

const trainingRow = (value: Record<string, unknown> = {}) => ({
  id: SETTING_IDS.training,
  key: 'training',
  value: { rest_seconds: 120, target_rir: { min: 1, max: 2 }, weight_step_kg: 1.25, ...value },
});

const newExercise = (fields: Record<string, unknown> = {}) => ({
  name_pl: 'Ćwiczenie próbne',
  primary_muscles: ['front_delts'],
  patterns: ['vertical_push'],
  implements: 2,
  unilateral: false,
  measure: 'reps',
  range_min: 8,
  range_max: 12,
  ...fields,
});

const propose = (name: string, input: unknown) => runNamed<ProposalToolOutput>(name, input);

// A call that must only answer with the reason: nothing proposed, nothing written.
async function refused(name: string, input: unknown) {
  const seq = await lastSeq();
  const output = await runNamed<{ error: string }>(name, input);
  expect(await lastSeq()).toBe(seq);
  expect(await db().select().from(pendingProposals)).toEqual([]);
  return output;
}

let token: string;
beforeEach(async () => {
  ({ token } = await createDevice());
});

const confirmed = async (proposalId: string) => {
  const response = await confirmProposal(token, proposalId);
  expect(response.status).toBe(200);
  return response.json<ProposalToolOutput>();
};

describe('every risky tool', () => {
  type Fixture = { first: string; second: string };

  const RISKY_CALLS: Record<string, (fixture: Fixture) => unknown> = {
    delete_sets: ({ first, second }) => ({ set_ids: [first, second] }),
    update_sets: ({ first, second }) => ({
      updates: [
        { set_id: first, weight_kg: 22.5 },
        { set_id: second, reps: 8 },
      ],
    }),
    create_exercise: () => newExercise({ aliases: ['próba'] }),
    update_exercise: () => ({ exercise_id: repsExercise.id, rest_seconds: 90, archived: true }),
    update_profile: () => ({ content: 'Cel: siła' }),
    update_settings: () => ({
      training: { rest_seconds: 90 },
      weekly_sets: [{ muscle_group: 'chest', min: 12, max: 18 }],
    }),
  };

  const withoutIds = (changes: ChangeView[]) =>
    changes.map(({ entity, op, before, after }) => ({
      entity,
      op,
      before: before && { ...before, id: null },
      after: after && { ...after, id: null },
    }));

  it('is listed, next to the workout proposal of plan.test.ts', () => {
    const names = TOOLS.filter((tool) => tool.risk === 'risky').map((tool) => tool.name);
    expect([...Object.keys(RISKY_CALLS), 'propose_plan', 'propose_workout'].sort()).toEqual(
      names.sort(),
    );
  });

  it.each(Object.keys(RISKY_CALLS))(
    '%s only proposes, writes that diff as one group when confirmed, and undoes',
    async (name) => {
      const {
        sets: [first, second],
      } = await pushDay(token, TODAY, [done(), done()]);
      const input = RISKY_CALLS[name]?.({ first: first?.id, second: second?.id } as Fixture);
      const [before, seq] = [await liveData(), await lastSeq()];

      const proposal = await propose(name, input);

      expect(proposal).toMatchObject({ status: 'pending', proposalId: expect.any(String) });
      expect(proposal.changes.length).toBeGreaterThan(0);
      expect(await liveData()).toEqual(before);
      expect(await lastSeq()).toBe(seq);
      expect(await db().select().from(pendingProposals)).toMatchObject([
        { id: proposal.proposalId, tool: name, thread_id: THREAD_ID, status: 'pending' },
      ]);

      const body = await confirmed(proposal.proposalId);

      expect(body.status).toBe('confirmed');
      expect(withoutIds(body.changes)).toEqual(withoutIds(proposal.changes));
      expect(await liveData()).not.toEqual(before);
      const group = await db()
        .select()
        .from(changeLog)
        .where(eq(changeLog.change_group_id, body.groupId ?? ''));
      expect(group).toHaveLength(body.changes.length);
      expect(
        group.every(({ actor, thread_id }) => actor === 'agent' && thread_id === THREAD_ID),
      ).toBe(true);

      const undo = await runNamed<WriteToolOutput>('undo_change', { group_id: body.groupId });
      expect(undo.groupId).toEqual(expect.any(String));
      expect(await liveData()).toEqual(before);
    },
  );
});

describe('delete_sets', () => {
  it('names the sets it can not find, deleted ones too', async () => {
    const {
      sets: [live, deleted],
    } = await pushDay(token, TODAY, [done(), done()]);
    await push(token, [remove('sets', deleted?.id as string)]);
    const missing = newId();

    expect(await refused('delete_sets', { set_ids: [live?.id, missing, deleted?.id] })).toEqual({
      error: 'set_not_found',
      set_ids: [missing, deleted?.id],
    });
  });

  it('takes a whole big workout, within what D1 binds', async () => {
    const workout = workoutRow({ date: TODAY });
    const rows = Array.from({ length: 50 }, (_, position) => setRow(workout.id, { position }));
    await push(token, [upsert('workouts', workout), ...rows.map((row) => upsert('sets', row))]);

    const proposal = await propose('delete_sets', { set_ids: rows.map((row) => row.id) });
    expect(proposal.changes).toHaveLength(50);
    expect((await confirmed(proposal.proposalId)).changes).toHaveLength(50);
  });

  it('shows what a restored set was when its deletion is undone', async () => {
    const {
      sets: [set],
    } = await pushDay(token, TODAY, [done({ weight_kg: 24 })]);
    const { groupId } = await confirmed(
      (await propose('delete_sets', { set_ids: [set?.id] })).proposalId,
    );
    const undo = await runNamed<WriteToolOutput>('undo_change', { group_id: groupId });
    expect(undo.changes).toMatchObject([
      { op: 'create', id: set?.id, before: null, after: { weight_kg: 24, status: 'done' } },
    ]);
  });
});

describe('update_sets', () => {
  it('shows the diff of done sets, keeping what the call leaves out', async () => {
    const {
      sets: [first, second],
    } = await pushDay(token, TODAY, [
      done({ rir: 1, note: 'Lewa' }),
      done({ exercise_id: timedExercise.id, weight_kg: 0, reps: null, duration_s: 45 }),
    ]);

    const { changes } = await propose('update_sets', {
      updates: [
        { set_id: first?.id, weight_kg: 22.6 },
        { set_id: second?.id, duration_s: 50 },
      ],
    });

    expect(changes).toMatchObject([
      {
        op: 'update',
        id: first?.id,
        before: { weight_kg: 20 },
        after: { weight_kg: 22.5, reps: 10, rir: 1, note: 'Lewa' },
      },
      { op: 'update', id: second?.id, after: { duration_s: 50, reps: null } },
    ]);
  });

  it('refuses a planned or missing set among them', async () => {
    const {
      sets: [logged, planned],
    } = await pushDay(token, TODAY, [done(), { status: 'planned' }]);
    const missing = newId();

    expect(
      await refused('update_sets', {
        updates: [
          { set_id: logged?.id, weight_kg: 22.5 },
          { set_id: planned?.id, weight_kg: 22.5 },
        ],
      }),
    ).toEqual({ error: 'not_done', set_id: planned?.id });
    expect(
      await refused('update_sets', {
        updates: [
          { set_id: logged?.id, weight_kg: 22.5 },
          { set_id: missing, weight_kg: 22.5 },
        ],
      }),
    ).toEqual({ error: 'set_not_found', set_ids: [missing] });
  });

  it('confirms on the current data: a change made since stays (D50)', async () => {
    const {
      sets: [first, second],
    } = await pushDay(token, TODAY, [done(), done()]);
    const proposal = await propose('update_sets', {
      updates: [
        { set_id: first?.id, weight_kg: 22.5 },
        { set_id: second?.id, weight_kg: 22.5 },
      ],
    });
    await push(token, [upsert('sets', { ...first, reps: 8 })]);

    expect((await confirmed(proposal.proposalId)).changes[0]).toMatchObject({
      before: { weight_kg: 20, reps: 8 },
      after: { weight_kg: 22.5, reps: 8 },
    });
    const [row] = await db()
      .select()
      .from(sets)
      .where(eq(sets.id, first?.id ?? ''));
    expect(row).toMatchObject({ weight_kg: 22.5, reps: 8 });
  });

  // Bug: each update starts from the stored set, so the last one of a set drops the others'
  // fields (edit_planned_sets combines them).
  it.fails('combines two updates of one set', async () => {
    const {
      sets: [set],
    } = await pushDay(token, TODAY, [done()]);
    const { changes } = await propose('update_sets', {
      updates: [
        { set_id: set?.id, weight_kg: 22.5 },
        { set_id: set?.id, reps: 8 },
      ],
    });
    expect(changes.at(-1)?.after).toMatchObject({ weight_kg: 22.5, reps: 8 });
  });
});

describe('create_exercise', () => {
  it('starts from the current default rest, unless given (D46)', async () => {
    await push(token, [upsert('settings', trainingRow({ rest_seconds: 75 }))]);
    const rest = async (fields: Record<string, unknown>) =>
      (await propose('create_exercise', newExercise(fields))).changes[0]?.after?.rest_seconds;
    expect(await rest({})).toBe(75);
    expect(await rest({ rest_seconds: 30 })).toBe(30);
  });

  it('puts the range on the measure and the step at the weight precision', async () => {
    const { changes } = await propose(
      'create_exercise',
      newExercise({ measure: 'time', range_min: 30, range_max: 60, weight_step_kg: 2.6 }),
    );
    expect(changes).toMatchObject([
      {
        entity: 'exercises',
        op: 'create',
        after: {
          measure: 'time',
          time_range_s: { min: 30, max: 60 },
          rep_range: null,
          weight_step_kg: 2.5,
          aliases: [],
          archived: false,
        },
      },
    ]);
  });

  it('gives the model a reason for an exercise the catalog could not hold', async () => {
    const invalid = { error: 'invalid_write', entity: 'exercises', id: expect.any(String) };
    expect(await refused('create_exercise', newExercise({ range_min: 12, range_max: 8 }))).toEqual(
      invalid,
    );
    expect(
      await refused('create_exercise', newExercise({ secondary_muscles: ['front_delts'] })),
    ).toEqual(invalid);
  });

  it('adds an exercise the tools can use once confirmed', async () => {
    const proposal = await propose(
      'create_exercise',
      newExercise({ measure: 'time', range_min: 30, range_max: 60 }),
    );
    await confirmed(proposal.proposalId);

    const { exercises: found } = await runNamed<{ exercises: { id: string; measure: string }[] }>(
      'find_exercise',
      { query: 'cwiczenie probne' },
    );
    expect(found).toMatchObject([{ measure: 'time' }]);
    const log = await runNamed<WriteToolOutput>('log_sets', {
      exercise_id: found[0]?.id,
      sets: [{ weight_kg: 10, duration_s: 45 }],
    });
    expect(log.groupId).toEqual(expect.any(String));
  });
});

describe('update_exercise', () => {
  it('changes what it gets and keeps the rest, the range on the measure', async () => {
    const reps = await propose('update_exercise', {
      exercise_id: repsExercise.id,
      range_max: 15,
      aliases: ['płaska'],
    });
    expect(reps.changes).toMatchObject([
      {
        op: 'update',
        id: repsExercise.id,
        before: { rep_range: repsExercise.rep_range, aliases: repsExercise.aliases },
        after: {
          rep_range: { min: repsExercise.rep_range?.min, max: 15 },
          time_range_s: null,
          aliases: ['płaska'],
          name_pl: repsExercise.name_pl,
          rest_seconds: repsExercise.rest_seconds,
        },
      },
    ]);

    const time = await propose('update_exercise', { exercise_id: timedExercise.id, range_min: 20 });
    expect(time.changes).toMatchObject([
      {
        after: {
          time_range_s: { min: 20, max: timedExercise.time_range_s?.max },
          rep_range: null,
        },
      },
    ]);
  });

  it('refuses what changes nothing: the same values, or the measure, which stays', async () => {
    const nothing = { error: 'nothing_to_change' };
    expect(
      await refused('update_exercise', {
        exercise_id: repsExercise.id,
        rest_seconds: repsExercise.rest_seconds,
      }),
    ).toEqual(nothing);
    expect(
      await refused('update_exercise', { exercise_id: repsExercise.id, measure: 'time' }),
    ).toEqual(nothing);
  });

  it('refuses an unknown exercise or a range that no longer holds', async () => {
    expect(
      await refused('update_exercise', { exercise_id: newId(), archived: true }),
    ).toMatchObject({ error: 'exercise_not_found' });
    expect(
      await refused('update_exercise', { exercise_id: repsExercise.id, range_min: 20 }),
    ).toEqual({ error: 'invalid_write', entity: 'exercises', id: repsExercise.id });
  });

  it('archives once confirmed, and can bring it back', async () => {
    const archive = await propose('update_exercise', {
      exercise_id: repsExercise.id,
      archived: true,
    });
    await confirmed(archive.proposalId);
    const archived = async () =>
      (await db().select().from(exercises).where(eq(exercises.id, repsExercise.id)))[0]?.archived;
    expect(await archived()).toBe(true);

    const back = await propose('update_exercise', {
      exercise_id: repsExercise.id,
      archived: false,
    });
    await confirmed(back.proposalId);
    expect(await archived()).toBe(false);
  });

  // Bug: create_exercise and update_settings round the step to the weight precision, this call
  // fails with `invalid_write` for the same value.
  it.fails('brings the step to the weight precision, like create_exercise', async () => {
    const output = await propose('update_exercise', {
      exercise_id: repsExercise.id,
      weight_step_kg: 2.6,
    });
    expect(output).toMatchObject({ changes: [{ after: { weight_step_kg: 2.5 } }] });
  });
});

describe('update_profile', () => {
  it('writes the row of the fixed id, and refuses the same content', async () => {
    const proposal = await propose('update_profile', { content: 'Cel: siła' });
    expect(proposal.changes).toMatchObject([
      { entity: 'athlete_profile', id: ATHLETE_PROFILE_ID, op: 'create', before: null },
    ]);
    await confirmed(proposal.proposalId);
    expect(await runNamed('get_profile', {})).toEqual({ content: 'Cel: siła' });

    expect(await runNamed('update_profile', { content: 'Cel: siła' })).toEqual({
      error: 'nothing_to_change',
    });
  });
});

describe('update_settings', () => {
  const settingRows = () => db().select().from(settings);

  it('keeps the training values the call leaves out, at the weight precision', async () => {
    await push(token, [
      upsert('settings', trainingRow({ rest_seconds: 75, target_rir: { min: 0, max: 3 } })),
    ]);
    const { changes } = await propose('update_settings', {
      training: { target_rir_max: 2, weight_step_kg: 2.6 },
    });
    expect(changes).toMatchObject([
      {
        id: SETTING_IDS.training,
        after: {
          key: 'training',
          value: { rest_seconds: 75, target_rir: { min: 0, max: 2 }, weight_step_kg: 2.5 },
        },
      },
    ]);
  });

  it('changes only the named muscle groups of the weekly targets', async () => {
    const proposal = await propose('update_settings', {
      weekly_sets: [{ muscle_group: 'chest', min: 12, max: 18 }],
    });
    await confirmed(proposal.proposalId);

    const [row] = await settingRows();
    expect(row).toMatchObject({ id: SETTING_IDS.balance, key: 'balance' });
    expect(row?.value).toEqual({
      weekly_sets: { ...DEFAULT_BALANCE_SETTINGS.weekly_sets, chest: { min: 12, max: 18 } },
    });
    const balance = await runNamed<{ muscles: { group: string; target: unknown }[] }>(
      'get_balance',
      {},
    );
    expect(balance.muscles.find(({ group }) => group === 'chest')?.target).toEqual({
      min: 12,
      max: 18,
    });
  });

  it('refuses an empty call or a range that does not hold', async () => {
    expect(await refused('update_settings', {})).toEqual({ error: 'nothing_to_change' });
    expect(await refused('update_settings', { weekly_sets: [] })).toEqual({
      error: 'nothing_to_change',
    });
    expect(await refused('update_settings', { training: { target_rir_min: 3 } })).toEqual({
      error: 'invalid_write',
      entity: 'settings',
      id: SETTING_IDS.training,
    });
    expect(
      await refused('update_settings', {
        weekly_sets: [{ muscle_group: 'chest', min: 20, max: 10 }],
      }),
    ).toEqual({ error: 'invalid_write', entity: 'settings', id: SETTING_IDS.balance });
  });
});

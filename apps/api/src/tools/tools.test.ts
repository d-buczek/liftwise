import {
  newId,
  type ProposalToolOutput,
  type SyncMutationInput,
  type WriteToolOutput,
} from '@liftwise/core';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import {
  call,
  createDevice,
  db,
  push,
  repsExercise,
  setRow,
  timedExercise,
  upsert,
  workoutRow,
} from '../../test/helpers';
import { changeLog, messages, sets, workouts } from '../db/schema';
import { applyWrites } from '../sync/write';
import { TOOLS, toolByName } from '.';
import { runTool, type ToolContext } from './registry';

const TODAY = '2026-10-31';
const NOW = '2026-10-31T18:00:00+01:00';
const threadId = newId();
const ctx = (): ToolContext => ({ db: db(), threadId, today: TODAY, now: NOW });

async function run<T = Record<string, unknown>>(name: string, input: unknown): Promise<T> {
  const tool = toolByName(name);
  if (!tool) throw new Error(`no tool ${name}`);
  return (await runTool(ctx(), tool, tool.input.parse(input))) as T;
}

let token: string;
beforeEach(async () => {
  ({ token } = await createDevice());
});

// A day's workout with sets, pushed by the user.
async function day(date: string, rows: Record<string, unknown>[]) {
  const workout = workoutRow({ date });
  const setRows = rows.map((fields, position) => setRow(workout.id, { position, ...fields }));
  const mutations: SyncMutationInput[] = [
    upsert('workouts', workout),
    ...setRows.map((row) => upsert('sets', row)),
  ];
  expect((await push(token, mutations)).status).toBe(200);
  return { workout, sets: setRows };
}

const done = (fields: Record<string, unknown> = {}) => ({
  status: 'done',
  performed_at: '2026-10-28T18:00:00+01:00',
  ...fields,
});

describe('tool registry', () => {
  it('has every v1 tool of §6.6 with its risk level', () => {
    const byRisk = (risk: string) =>
      TOOLS.filter((tool) => tool.risk === risk).map((tool) => tool.name);
    expect(byRisk('read')).toHaveLength(11);
    expect(byRisk('write')).toEqual([
      'log_sets',
      'update_set',
      'copy_workout',
      'edit_planned_sets',
      'start_workout',
      'finish_workout',
      'undo_change',
    ]);
    expect(byRisk('risky')).toEqual([
      'delete_sets',
      'update_sets',
      'create_exercise',
      'update_exercise',
      'update_profile',
      'update_settings',
    ]);
  });
});

describe('read tools', () => {
  it('finds exercises and answers when an exercise was last done', async () => {
    const found = await run<{ exercises: { id: string }[] }>('find_exercise', {
      query: repsExercise.name_pl.toUpperCase(),
    });
    expect(found.exercises.map((exercise) => exercise.id)).toContain(repsExercise.id);

    await day('2026-10-20', [done({ weight_kg: 18 })]);
    await day('2026-10-27', [done({ weight_kg: 20, rir: 1 }), done({ warmup: true })]);
    const history = await run<{ sessions: { date: string; sets: unknown[] }[] }>(
      'get_exercise_history',
      { exercise_id: repsExercise.id },
    );
    expect(history.sessions.map((session) => session.date)).toEqual(['2026-10-27', '2026-10-20']);
    expect(history.sessions[0]?.sets).toMatchObject([{ weight_kg: 20, reps: 10, rir: 1 }]);
    expect(await run('get_exercise_history', { exercise_id: newId() })).toMatchObject({
      error: 'exercise_not_found',
    });
  });

  it("shows today's workout and rejects a too long range", async () => {
    await day(TODAY, [{ status: 'planned' }]);
    const active = await run<{ workouts: { sets: unknown[] }[] }>('get_active_workout', {});
    expect(active.workouts[0]?.sets).toMatchObject([
      { exercise: repsExercise.name_pl, status: 'planned', reps: 10 },
    ]);
    expect(await run('get_workouts', { from: '2026-01-01', to: TODAY })).toMatchObject({
      error: 'invalid_range',
    });
  });
});

describe('write tools', () => {
  it('logs sets as one agent change group of the thread', async () => {
    const { sets: planned } = await day(TODAY, [{ status: 'planned' }]);
    const result = await run<WriteToolOutput>('log_sets', {
      exercise_id: repsExercise.id,
      sets: [
        { weight_kg: 24, reps: 10 },
        { weight_kg: 24, reps: 10, rir: 0 },
      ],
    });
    // The planned set is completed, one set is added and the workout starts.
    expect(result.changes.map(({ entity, op }) => `${entity}:${op}`)).toEqual([
      'workouts:update',
      'sets:update',
      'sets:create',
    ]);
    expect(result.changes[1]).toMatchObject({ id: planned[0]?.id, after: { status: 'done' } });
    const log = await db()
      .select()
      .from(changeLog)
      .where(eq(changeLog.change_group_id, result.groupId ?? ''));
    expect(log).toHaveLength(3);
    expect(log.every((entry) => entry.actor === 'agent' && entry.thread_id === threadId)).toBe(
      true,
    );
  });

  it('asks for what is missing instead of writing', async () => {
    expect(
      await run('log_sets', { exercise_id: timedExercise.id, sets: [{ weight_kg: 0, reps: 5 }] }),
    ).toMatchObject({ error: 'duration_missing' });
    expect(
      await run('log_sets', {
        exercise_id: repsExercise.id,
        date: '2026-11-02',
        sets: [{ weight_kg: 20, reps: 10 }],
      }),
    ).toMatchObject({ error: 'future_date' });
    expect(await db().select().from(changeLog)).toHaveLength(0);
  });

  it('changes one done set and leaves planned ones to edit_planned_sets', async () => {
    const {
      sets: [last, plan],
    } = await day(TODAY, [done(), { status: 'planned' }]);
    const result = await run<WriteToolOutput>('update_set', { set_id: last?.id, weight_kg: 22 });
    expect(result.changes).toMatchObject([{ before: { weight_kg: 20 }, after: { weight_kg: 22 } }]);
    expect(await run('update_set', { set_id: plan?.id, weight_kg: 22 })).toMatchObject({
      error: 'not_done',
    });
  });

  it('copies a day and undoes it', async () => {
    await day('2026-10-28', [done(), done()]);
    const copy = await run<WriteToolOutput>('copy_workout', {
      from_date: '2026-10-28',
      to_date: '2026-11-01',
    });
    expect(copy.changes.map(({ entity, op }) => `${entity}:${op}`)).toEqual([
      'workouts:create',
      'sets:create',
      'sets:create',
    ]);
    const undo = await run<WriteToolOutput>('undo_change', { group_id: copy.groupId });
    expect(undo.changes.every((change) => change.op === 'delete')).toBe(true);
    expect(await run('undo_change', { group_id: copy.groupId })).toMatchObject({
      error: 'already_undone',
    });
  });

  it('edits planned sets and never done ones', async () => {
    const {
      sets: [first, second, logged],
    } = await day(TODAY, [{ status: 'planned' }, { status: 'planned' }, done()]);
    const result = await run<WriteToolOutput>('edit_planned_sets', {
      date: TODAY,
      update: [{ set_id: first?.id, weight_kg: 22.5 }],
      remove: [second?.id],
      add: [{ exercise_id: timedExercise.id, sets: [{ weight_kg: 0, duration_s: 45 }] }],
    });
    expect(result.changes.map(({ entity, op }) => `${entity}:${op}`)).toEqual([
      'sets:create',
      'sets:delete',
      'sets:update',
    ]);
    expect(await run('edit_planned_sets', { date: TODAY, remove: [logged?.id] })).toMatchObject({
      error: 'not_planned',
    });
  });

  it('starts and finishes the workout', async () => {
    const started = await run<WriteToolOutput>('start_workout', {});
    expect(started.changes).toMatchObject([{ op: 'create', after: { started_at: NOW } }]);
    expect(await run('start_workout', {})).toMatchObject({ error: 'already_started' });
    const finished = await run<WriteToolOutput>('finish_workout', {});
    expect(finished.changes).toMatchObject([{ after: { ended_at: NOW } }]);
  });
});

describe('risky tools', () => {
  // The proposal as the stored assistant message carries it.
  async function propose(input: unknown) {
    const proposal = await run<ProposalToolOutput>('delete_sets', input);
    const message = {
      id: newId(),
      thread_id: threadId,
      role: 'assistant',
      parts: [
        {
          type: 'tool-delete_sets',
          toolCallId: 'call-1',
          state: 'output-available',
          output: proposal,
        },
      ],
    };
    await applyWrites(db(), { actor: 'agent', threadId }, [
      { groupId: newId(), entity: 'messages', op: 'upsert', row: message },
    ]);
    return { proposal, messageId: message.id };
  }

  const storedOutput = async (messageId: string) => {
    const [row] = await db().select().from(messages).where(eq(messages.id, messageId));
    return (row?.parts[0] as { output: ProposalToolOutput } | undefined)?.output;
  };

  it('proposes without writing and writes one group on confirmation', async () => {
    const {
      sets: [set],
    } = await day(TODAY, [done()]);
    const { proposal, messageId } = await propose({ set_ids: [set?.id] });
    expect(proposal).toMatchObject({ status: 'pending', changes: [{ op: 'delete' }] });
    const live = () =>
      db()
        .select()
        .from(sets)
        .where(eq(sets.id, set?.id ?? ''));
    expect((await live())[0]?.deleted_at).toBeNull();

    const confirm = () =>
      call(`/api/agent/proposals/${proposal.proposalId}/confirm`, { method: 'POST', token });
    const response = await confirm();
    expect(response.status).toBe(200);
    const body = await response.json<ProposalToolOutput>();
    expect(body).toMatchObject({ status: 'confirmed', changes: [{ op: 'delete' }] });
    expect((await live())[0]?.deleted_at).not.toBeNull();
    expect(await storedOutput(messageId)).toMatchObject({
      status: 'confirmed',
      groupId: body.groupId,
    });
    expect((await confirm()).status).toBe(409);
  });

  it('writes nothing on rejection', async () => {
    const {
      workout,
      sets: [set],
    } = await day(TODAY, [done()]);
    const { proposal, messageId } = await propose({ set_ids: [set?.id] });
    const response = await call(`/api/agent/proposals/${proposal.proposalId}/reject`, {
      method: 'POST',
      token,
    });
    expect(await response.json()).toMatchObject({ status: 'rejected' });
    expect(await storedOutput(messageId)).toMatchObject({ status: 'rejected' });
    const [stored] = await db().select().from(workouts).where(eq(workouts.id, workout.id));
    expect(stored?.deleted_at).toBeNull();
    // Only the stored message changed: it carries the status.
    const logged = await db().select().from(changeLog).where(eq(changeLog.actor, 'agent'));
    expect(logged.map((entry) => entry.entity)).toEqual(['messages', 'messages']);
  });

  it('keeps a proposal that no longer fits pending', async () => {
    const {
      sets: [set],
    } = await day(TODAY, [done()]);
    const { proposal } = await propose({ set_ids: [set?.id] });
    await push(token, [
      {
        mutationId: newId(),
        groupId: newId(),
        op: 'delete',
        entity: 'sets',
        row: { id: set?.id ?? '' },
      },
    ]);
    const response = await call(`/api/agent/proposals/${proposal.proposalId}/confirm`, {
      method: 'POST',
      token,
    });
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: 'stale', reason: 'set_not_found' });
  });

  it('proposes profile, exercise and settings changes', async () => {
    expect(await run('update_profile', { content: 'Cel: siła' })).toMatchObject({
      changes: [{ entity: 'athlete_profile', after: { content: 'Cel: siła' } }],
    });
    const created = await run<ProposalToolOutput>('create_exercise', {
      name_pl: 'Wyciskanie Arnolda',
      primary_muscles: ['front_delts'],
      patterns: ['vertical_push'],
      implements: 2,
      unilateral: false,
      measure: 'reps',
      range_min: 8,
      range_max: 12,
    });
    // A new exercise starts with the default rest (D46).
    expect(created.changes[0]?.after).toMatchObject({
      rest_seconds: 120,
      rep_range: { min: 8, max: 12 },
    });
    expect(await run('update_settings', { training: { target_rir_min: 0 } })).toMatchObject({
      changes: [{ after: { value: { target_rir: { min: 0, max: 2 } } } }],
    });
  });
});

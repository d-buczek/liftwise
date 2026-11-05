import {
  newId,
  type ProposalToolOutput,
  type ToolErrorOutput,
  type WriteToolOutput,
} from '@liftwise/core';
import { asSchema } from 'ai';
import { eq } from 'drizzle-orm';
import { beforeEach, describe, expect, it } from 'vite-plus/test';
import { z } from 'zod';
import {
  createDevice,
  db,
  lastSeq,
  push,
  remove,
  repsExercise,
  setRow,
  timedExercise,
  workoutRow,
} from '../../test/helpers';
import { pushDay, runNamed, THREAD_ID, TODAY, toolContext } from '../../test/tools';
import { changeLog, messages, pendingProposals, workouts } from '../db/schema';
import { applyWrites } from '../sync/write';
import { agentTools, toolByName } from '.';
import { commit, defineTool, recordResolution, runTool, ToolError } from './registry';

let token: string;
beforeEach(async () => {
  ({ token } = await createDevice());
});

describe('runTool', () => {
  const failing = (error: Error) =>
    defineTool({
      name: 'failing',
      description: '',
      input: z.object({}),
      risk: 'read',
      run: async () => {
        throw error;
      },
    });

  it('gives the model the reason a call can not run, with its details', async () => {
    const tool = failing(new ToolError('not_done', { set_id: 'a' }));
    expect(await runTool(toolContext(), tool, {})).toEqual({ error: 'not_done', set_id: 'a' });
  });

  it('gives the model the record of an invalid write, and writes nothing', async () => {
    const row = setRow(newId());
    const tool = defineTool({
      name: 'writing',
      description: '',
      input: z.object({}),
      risk: 'write',
      run: (ctx) => commit(ctx, [{ entity: 'sets', op: 'upsert', row }]),
    });
    const seq = await lastSeq();
    expect(await runTool(toolContext(), tool, {})).toEqual({
      error: 'invalid_write',
      entity: 'sets',
      id: row.id,
    });
    expect(await lastSeq()).toBe(seq);
  });

  it('lets anything else fail the call', async () => {
    const tool = failing(new Error('D1 down'));
    await expect(runTool(toolContext(), tool, {})).rejects.toThrow('D1 down');
  });

  it('stores a risky plan instead of running it, unless the tool proposes by itself', async () => {
    const workout = workoutRow();
    const planned = defineTool({
      name: 'planned',
      description: '',
      input: z.object({ note: z.string() }),
      risk: 'risky',
      plan: async (_ctx, { note }) => [
        { entity: 'workouts', op: 'upsert', row: { ...workout, note } },
      ],
    });
    const seq = await lastSeq();
    const proposal = (await runTool(toolContext(), planned, { note: 'a' })) as ProposalToolOutput;
    expect(proposal).toMatchObject({ status: 'pending', changes: [{ after: { note: 'a' } }] });
    expect(await lastSeq()).toBe(seq);
    expect(await db().select().from(workouts).where(eq(workouts.id, workout.id))).toEqual([]);
    expect(await db().select().from(pendingProposals)).toMatchObject([
      { id: proposal.proposalId, tool: 'planned', input: { note: 'a' }, thread_id: THREAD_ID },
    ]);

    const answer: ProposalToolOutput = { proposalId: 'p', status: 'pending', changes: [] };
    const proposing = defineTool({
      name: 'proposing',
      description: '',
      input: z.object({}),
      risk: 'risky',
      propose: async () => answer,
    });
    expect(await runTool(toolContext(), proposing, {})).toBe(answer);
    expect(await db().select().from(pendingProposals)).toHaveLength(1);
  });

  it('stores no proposal for a call that changes nothing', async () => {
    const unchanging = defineTool({
      name: 'unchanging',
      description: '',
      input: z.object({}),
      risk: 'risky',
      // A delete of a record that isn't there is a no-op.
      plan: async () => [{ entity: 'sets', op: 'delete', row: { id: newId() } }],
    });
    expect(await runTool(toolContext(), unchanging, {})).toEqual({ error: 'nothing_to_change' });
    expect(await db().select().from(pendingProposals)).toEqual([]);
  });
});

describe('commit', () => {
  it('writes a call as one group and shows the domain fields of each change', async () => {
    const { workout } = await pushDay(token, TODAY, []);
    const created = setRow(workout.id);
    const result = await commit(toolContext(), [
      { entity: 'workouts', op: 'upsert', row: { ...workout, note: 'Po' } },
      { entity: 'sets', op: 'upsert', row: created },
    ]);

    expect(result.changes.map(({ entity, id, op }) => ({ entity, id, op }))).toEqual([
      { entity: 'workouts', id: workout.id, op: 'update' },
      { entity: 'sets', id: created.id, op: 'create' },
    ]);
    const [update, create] = result.changes;
    expect(update?.before).toMatchObject({ id: workout.id, note: '' });
    expect(update?.after).toMatchObject({ id: workout.id, note: 'Po' });
    expect(create?.before).toBeNull();
    for (const key of ['seq', 'created_at', 'updated_at', 'deleted_at']) {
      expect(update?.after).not.toHaveProperty(key);
      expect(update?.before).not.toHaveProperty(key);
    }
    const groups = await db()
      .select({ group: changeLog.change_group_id })
      .from(changeLog)
      .where(eq(changeLog.actor, 'agent'));
    expect(groups).toEqual([{ group: result.groupId }, { group: result.groupId }]);
  });

  it('shows a deleted row as a delete and a row back from its tombstone as a create', async () => {
    const { workout } = await pushDay(token, TODAY, []);
    const deleted = await commit(toolContext(), [
      { entity: 'workouts', op: 'delete', row: { id: workout.id } },
    ]);
    expect(deleted.changes).toMatchObject([
      { op: 'delete', before: { id: workout.id }, after: null },
    ]);

    const back = await commit(toolContext(), [
      { entity: 'workouts', op: 'upsert', row: { id: workout.id, date: TODAY } },
    ]);
    expect(back.changes).toMatchObject([{ op: 'create', before: null, after: { id: workout.id } }]);
  });

  it('has no group without a change', async () => {
    const seq = await lastSeq();
    const none: WriteToolOutput = { groupId: null, changes: [] };
    expect(await commit(toolContext(), [])).toEqual(none);
    expect(
      await commit(toolContext(), [{ entity: 'sets', op: 'delete', row: { id: newId() } }]),
    ).toEqual(none);
    expect(await lastSeq()).toBe(seq);
  });
});

describe('recordResolution', () => {
  const proposalPart = (toolCallId: string, proposalId: string, fields = {}) => ({
    type: 'tool-delete_sets',
    toolCallId,
    state: 'output-available',
    output: { proposalId, status: 'pending', changes: [], ...fields },
  });

  async function storeMessage(threadId: string, parts: Record<string, unknown>[]) {
    const id = newId();
    await applyWrites(db(), { actor: 'agent', threadId }, [
      {
        groupId: newId(),
        entity: 'messages',
        op: 'upsert',
        row: { id, thread_id: threadId, role: 'assistant', parts },
      },
    ]);
    return id;
  }

  const partsOf = async (id: string) =>
    (await db().select().from(messages).where(eq(messages.id, id)))[0]?.parts as {
      output?: Record<string, unknown>;
    }[];

  const change = {
    entity: 'sets' as const,
    id: 'a',
    op: 'delete' as const,
    before: { id: 'a' },
    after: null,
  };

  it('updates only the card of that proposal, and only in that thread', async () => {
    const [mine, other, elsewhere] = [newId(), newId(), newId()];
    const text = { type: 'text', text: 'Do zatwierdzenia.' };
    const id = await storeMessage(THREAD_ID, [
      proposalPart('1', mine),
      proposalPart('2', other),
      text,
    ]);
    const foreign = await storeMessage(elsewhere, [proposalPart('1', mine)]);

    await recordResolution(db(), THREAD_ID, mine, {
      status: 'confirmed',
      groupId: 'g',
      changes: [change],
    });

    const [first, second, third] = await partsOf(id);
    expect(first?.output).toMatchObject({
      proposalId: mine,
      status: 'confirmed',
      groupId: 'g',
      changes: [change],
    });
    expect(second?.output).toEqual({ proposalId: other, status: 'pending', changes: [] });
    expect(third).toEqual(text);
    expect((await partsOf(foreign))[0]?.output).toMatchObject({ status: 'pending' });
  });

  it('keeps the changes of a plan card empty', async () => {
    const proposalId = newId();
    const id = await storeMessage(THREAD_ID, [proposalPart('1', proposalId, { plan: {} })]);
    await recordResolution(db(), THREAD_ID, proposalId, {
      status: 'confirmed',
      groupId: 'g',
      changes: [change],
    });
    expect((await partsOf(id))[0]?.output).toMatchObject({
      status: 'confirmed',
      groupId: 'g',
      changes: [],
    });
  });

  it('writes nothing when no stored message carries the proposal', async () => {
    const seq = await lastSeq();
    await storeMessage(THREAD_ID, [{ type: 'text', text: 'Cześć' }]);
    const stored = await lastSeq();
    expect(stored).toBeGreaterThan(seq);
    await recordResolution(db(), THREAD_ID, newId(), { status: 'rejected', changes: [] });
    expect(await lastSeq()).toBe(stored);
  });
});

describe('what the model is offered', () => {
  it('has no string formats in the input schemas: providers differ in them (§6.6)', async () => {
    const offered = agentTools(toolContext());
    const schemas = await Promise.all(
      Object.entries(offered).map(async ([name, tool]) => ({
        name,
        schema: JSON.stringify(await asSchema(tool.inputSchema).jsonSchema),
      })),
    );
    expect(schemas.filter(({ schema }) => schema.includes('"format"'))).toEqual([]);
  });
});

describe('inputs', () => {
  const set = { weight_kg: 20, reps: 10 };
  const twentyOne = Array.from({ length: 21 }, () => set);
  const fiftyOne = (item: unknown) => Array.from({ length: 51 }, () => item);
  const exercise = {
    name_pl: 'Próba',
    primary_muscles: ['chest'],
    patterns: ['isolation'],
    implements: 1,
    unilateral: false,
    measure: 'reps',
    range_min: 8,
    range_max: 12,
  };

  // Each tool's valid input and what §5.1 and the tools' limits don't let through.
  const CASES: [string, unknown, unknown[]][] = [
    [
      'log_sets',
      { exercise_id: 'x', sets: [set] },
      [
        { exercise_id: 'x', sets: [] },
        { exercise_id: 'x', sets: twentyOne },
        { exercise_id: 'x', sets: [{ ...set, weight_kg: -1 }] },
        { exercise_id: 'x', sets: [{ ...set, reps: 0 }] },
        { exercise_id: 'x', sets: [{ ...set, reps: 1.5 }] },
        { exercise_id: 'x', sets: [{ weight_kg: 0, duration_s: 0 }] },
        { exercise_id: 'x', sets: [{ ...set, rir: 5 }] },
        { exercise_id: 'x', sets: [{ ...set, rir: -1 }] },
        { sets: [set] },
      ],
    ],
    [
      'update_set',
      { set_id: 'x', rir: 4 },
      [{ set_id: 'x', rir: 5 }, { set_id: 'x', weight_kg: -1 }, { set_id: 'x', reps: 0 }, {}],
    ],
    [
      'edit_planned_sets',
      { date: TODAY, add: [{ exercise_id: 'x', sets: [set] }] },
      [
        { add: [] },
        { date: TODAY, add: [{ exercise_id: 'x', sets: twentyOne }] },
        { date: TODAY, update: [{ set_id: 'x', rir: 5 }] },
      ],
    ],
    ['undo_change', { group_id: 'x', confirm: true }, [{}, { group_id: 'x', confirm: 'tak' }]],
    ['delete_sets', { set_ids: ['x'] }, [{ set_ids: [] }, { set_ids: fiftyOne('x') }]],
    [
      'update_sets',
      { updates: [{ set_id: 'x' }] },
      [{ updates: [] }, { updates: fiftyOne({ set_id: 'x' }) }],
    ],
    [
      'create_exercise',
      exercise,
      [
        { ...exercise, name_pl: '' },
        { ...exercise, primary_muscles: [] },
        { ...exercise, primary_muscles: ['nogi'] },
        { ...exercise, patterns: [] },
        { ...exercise, implements: 3 },
        { ...exercise, measure: 'kg' },
        { ...exercise, range_min: 0 },
        { ...exercise, weight_step_kg: 0 },
      ],
    ],
    [
      'update_settings',
      {
        training: { target_rir_max: 4 },
        weekly_sets: [{ muscle_group: 'chest', min: 0, max: 40 }],
      },
      [
        { training: { target_rir_max: 5 } },
        { training: { weight_step_kg: 0 } },
        { weekly_sets: [{ muscle_group: 'chest', min: 0, max: 41 }] },
        { weekly_sets: [{ muscle_group: 'nogi', min: 0, max: 10 }] },
      ],
    ],
    [
      'get_exercise_history',
      { exercise_id: 'x', sessions: 20 },
      [
        { exercise_id: 'x', sessions: 0 },
        { exercise_id: 'x', sessions: 21 },
      ],
    ],
    ['propose_workout', { time_min: 30, wellbeing: 5 }, [{ time_min: 0 }, { wellbeing: 6 }]],
  ];

  it.each(CASES)('%s rejects what is out of bounds', (name, valid, invalid) => {
    const { input } = toolByName(name)!;
    expect(input.safeParse(valid).success).toBe(true);
    expect(invalid.filter((bad) => input.safeParse(bad).success)).toEqual([]);
  });

  it.each([
    ['log_sets', (date: string) => ({ exercise_id: repsExercise.id, date, sets: [{ ...set }] })],
    ['copy_workout', (date: string) => ({ from_date: date, to_date: TODAY })],
    ['copy_workout', (date: string) => ({ from_date: TODAY, to_date: date })],
    ['edit_planned_sets', (date: string) => ({ date })],
    ['start_workout', (date: string) => ({ date })],
    ['finish_workout', (date: string) => ({ date })],
    ['get_workouts', (date: string) => ({ from: date, to: TODAY })],
    ['get_workouts', (date: string) => ({ from: TODAY, to: date })],
    ['get_progression_hints', (date: string) => ({ date })],
    ['get_weekly_summary', (date: string) => ({ date })],
    ['propose_workout', (date: string) => ({ date })],
  ] as const)('%s checks its dates', async (name, input) => {
    for (const date of ['jutro', '31.10.2026', '2026-02-31', '']) {
      expect(await runNamed<ToolErrorOutput>(name, input(date))).toEqual({
        error: 'invalid_date',
        value: date,
      });
    }
  });

  it.each([
    ['get_records', (id: string) => ({ exercise_id: id })],
    ['get_progression_hints', (id: string) => ({ exercise_id: id })],
    ['get_swap_options', (id: string) => ({ exercise_id: id })],
    [
      'edit_planned_sets',
      (id: string) => ({
        date: TODAY,
        swap: [{ exercise_id: id, to_exercise_id: timedExercise.id }],
      }),
    ],
    [
      'edit_planned_sets',
      (id: string) => ({
        date: TODAY,
        swap: [{ exercise_id: timedExercise.id, to_exercise_id: id }],
      }),
    ],
  ] as const)('%s refuses an unknown or deleted exercise', async (name, input) => {
    expect((await push(token, [remove('exercises', repsExercise.id)])).status).toBe(200);
    for (const id of [newId(), repsExercise.id]) {
      expect(await runNamed<ToolErrorOutput>(name, input(id))).toEqual({
        error: 'exercise_not_found',
        exercise_id: id,
      });
    }
  });
});

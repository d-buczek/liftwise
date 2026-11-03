import {
  addDays,
  newId,
  type PlanToolOutput,
  type SyncMutationInput,
  type ToolErrorOutput,
} from '@liftwise/core';
import { MockLanguageModelV4 } from 'ai/test';
import { and, eq, isNull } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
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
import { ProviderUnavailable } from '../agent/providers';
import { changeLog, messages, pendingProposals, sets, threads, workouts } from '../db/schema';
import { applyWrites } from '../sync/write';
import { toolByName } from '.';
import { runTool } from './registry';

// Confirming runs on the real clock, so the dates follow it.
const TODAY = new Date().toISOString().slice(0, 10);
const YESTERDAY = addDays(TODAY, -1);
const LATER = addDays(TODAY, 2);
const NOW = `${TODAY}T18:00:00+01:00`;
const DUMBBELL_MAX_KG = 30;

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};

const planOutput = (fields: Record<string, unknown> = {}) => ({
  exercises: [
    {
      exercise_id: repsExercise.id,
      sets: [
        { weight_kg: 12, reps: 12, duration_s: null, warmup: true },
        { weight_kg: 22.5, reps: 10, duration_s: null, warmup: false },
        { weight_kg: DUMBBELL_MAX_KG + 10, reps: 8, duration_s: null, warmup: false },
      ],
      target_rir: 1,
    },
    {
      exercise_id: timedExercise.id,
      sets: [{ weight_kg: 0, reps: null, duration_s: 45, warmup: false }],
      target_rir: null,
    },
  ],
  rationale: 'Krótki trening, bo masz mało czasu.',
  ...fields,
});

// A `planner` that answers each call in turn.
const plannerAnswering = (...answers: unknown[]) =>
  new MockLanguageModelV4({
    doGenerate: answers.map((answer) => ({
      content: [{ type: 'text' as const, text: JSON.stringify(answer) }],
      finishReason: { unified: 'stop' as const, raw: 'stop' },
      usage,
      warnings: [],
    })),
  });

let token: string;
let threadId: string;

async function startThread() {
  threadId = newId();
  await applyWrites(db(), { actor: 'user', threadId }, [
    {
      groupId: newId(),
      entity: 'threads',
      op: 'upsert',
      row: { id: threadId, date: TODAY, workout_id: null },
    },
  ]);
}

beforeEach(async () => {
  ({ token } = await createDevice());
  await startThread();
  const mutations: SyncMutationInput[] = [
    upsert('equipment_items', {
      id: newId(),
      type: 'dumbbells',
      props: { max_kg: DUMBBELL_MAX_KG },
    }),
    upsert('equipment_items', {
      id: newId(),
      type: 'bench',
      props: { incline: true, decline: false },
    }),
  ];
  await push(token, mutations);
});

// One call of the model-facing tool, kept in the thread as a stored assistant message.
async function proposeWorkout(
  planner: () => MockLanguageModelV4,
  input: Record<string, unknown> = {},
  today = TODAY,
) {
  const tool = toolByName('propose_workout')!;
  const output = (await runTool(
    { db: db(), threadId, today, now: NOW, planner },
    tool,
    tool.input.parse(input),
  )) as PlanToolOutput & ToolErrorOutput;
  const messageId = newId();
  if (!output.error) {
    await applyWrites(db(), { actor: 'agent', threadId }, [
      {
        groupId: newId(),
        entity: 'messages',
        op: 'upsert',
        row: {
          id: messageId,
          thread_id: threadId,
          role: 'assistant',
          parts: [
            {
              type: 'tool-propose_workout',
              toolCallId: 'call-1',
              state: 'output-available',
              output,
            },
          ],
        },
      },
    ]);
  }
  return { output, messageId };
}

const confirm = (proposalId: string) =>
  call(`/api/agent/proposals/${proposalId}/confirm`, { method: 'POST', token });

const storedOutput = async (messageId: string) => {
  const [row] = await db().select().from(messages).where(eq(messages.id, messageId));
  return (row?.parts[0] as { output: PlanToolOutput } | undefined)?.output;
};

const promptOf = (model: MockLanguageModelV4, index = 0) =>
  JSON.stringify(model.doGenerateCalls[index]?.prompt);

const liveSets = () => db().select().from(sets).where(isNull(sets.deleted_at));

// A day with a done set and a planned one.
async function plannedDay(date: string) {
  const workout = workoutRow({ date });
  const doneSet = setRow(workout.id, {
    position: 0,
    status: 'done',
    performed_at: `${date}T17:00:00+01:00`,
  });
  const planned = setRow(workout.id, { position: 1, weight_kg: 18 });
  const mutations = [workout, doneSet, planned].map((row, i) =>
    upsert(i === 0 ? 'workouts' : 'sets', row),
  );
  expect((await push(token, mutations)).status).toBe(200);
  return { workout, doneSet, planned };
}

describe('propose_workout', () => {
  it('asks the planner with the context and writes nothing', async () => {
    const { planned } = await plannedDay(LATER);
    const model = plannerAnswering(planOutput());
    const { output } = await proposeWorkout(() => model, {
      date: LATER,
      time_min: 30,
      wellbeing: 3,
      pain: 'bark',
    });

    expect(output).toMatchObject({ status: 'pending', changes: [], date: LATER, replaces: 1 });
    const sent = promptOf(model);
    expect(sent).toContain(`Workout for ${LATER}`);
    expect(sent).toContain('time available: 30 min');
    expect(sent).toContain('wellbeing (1-5): 3');
    expect(sent).toContain('pain or limitations: bark');
    expect(sent).toContain(repsExercise.id);
    expect(sent).toContain(`${repsExercise.name_pl} 18 kg x 10`);
    expect(sent).toContain('step 1.25 kg');

    // Weights fit the equipment.
    expect(output.plan.exercises[0]?.sets.map((set) => set.weight_kg)).toEqual([
      12,
      22.5,
      DUMBBELL_MAX_KG,
    ]);
    const [row] = await db()
      .select()
      .from(sets)
      .where(eq(sets.id, planned.id as string));
    expect(row?.deleted_at).toBeNull();
    expect(await liveSets()).toHaveLength(2);
    const [stored] = await db()
      .select()
      .from(pendingProposals)
      .where(eq(pendingProposals.id, output.proposalId));
    expect(stored).toMatchObject({ tool: 'propose_plan', status: 'pending' });
  });

  it('accepting replaces the planned sets, keeps the done ones and can be undone', async () => {
    const { workout, doneSet, planned } = await plannedDay(LATER);
    const model = plannerAnswering(planOutput());
    const { output, messageId } = await proposeWorkout(() => model, {
      date: LATER,
      time_min: 30,
    });

    const response = await confirm(output.proposalId);
    expect(response.status).toBe(200);
    const { groupId } = await response.json<{ groupId: string }>();

    const live = await liveSets();
    expect(live.map((set) => set.id)).toContain(doneSet.id);
    expect(live.map((set) => set.id)).not.toContain(planned.id);
    const added = live
      .filter((set) => set.source === 'proposal')
      .sort((a, b) => a.position - b.position);
    expect(
      added.map(({ status, weight_kg, rir, warmup, position, workout_id }) => ({
        status,
        weight_kg,
        rir,
        warmup,
        position,
        workout_id,
      })),
    ).toEqual([
      {
        status: 'planned',
        weight_kg: 12,
        rir: null,
        warmup: true,
        position: 1,
        workout_id: workout.id,
      },
      {
        status: 'planned',
        weight_kg: 22.5,
        rir: 1,
        warmup: false,
        position: 2,
        workout_id: workout.id,
      },
      {
        status: 'planned',
        weight_kg: DUMBBELL_MAX_KG,
        rir: 1,
        warmup: false,
        position: 3,
        workout_id: workout.id,
      },
      {
        status: 'planned',
        weight_kg: 0,
        rir: null,
        warmup: false,
        position: 4,
        workout_id: workout.id,
      },
    ]);

    const workoutRows = await db()
      .select()
      .from(workouts)
      .where(eq(workouts.id, workout.id as string));
    expect(workoutRows[0]).toMatchObject({
      rationale: 'Krótki trening, bo masz mało czasu.',
      checkin: { time_min: 30, wellbeing: null, pain: null },
      started_at: null,
    });
    const threadRow = async () =>
      (await db().select().from(threads).where(eq(threads.id, threadId)))[0];
    expect((await threadRow())?.workout_id).toBe(workout.id);

    // The card shows the outcome; a list of every set stays out of the thread.
    expect(await storedOutput(messageId)).toMatchObject({
      status: 'confirmed',
      groupId,
      changes: [],
      plan: output.plan,
    });
    const logged = await db()
      .select()
      .from(changeLog)
      .where(eq(changeLog.change_group_id, groupId));
    expect(logged.every((row) => row.actor === 'agent')).toBe(true);

    expect((await call(`/api/changes/${groupId}/undo`, { method: 'POST', token })).status).toBe(
      200,
    );
    expect((await liveSets()).map((set) => set.id).sort()).toEqual([doneSet.id, planned.id].sort());
    const undone = await db()
      .select()
      .from(workouts)
      .where(eq(workouts.id, workout.id as string));
    expect(undone[0]).toMatchObject({ rationale: null, checkin: null });
    expect((await threadRow())?.workout_id).toBeNull();
  });

  it('creates the workout of an empty day', async () => {
    const model = plannerAnswering(planOutput());
    const { output } = await proposeWorkout(() => model, {});
    expect(output.date).toBe(TODAY);
    expect(output.replaces).toBe(0);
    expect((await confirm(output.proposalId)).status).toBe(200);
    const [created] = await db()
      .select()
      .from(workouts)
      .where(and(eq(workouts.date, TODAY), isNull(workouts.deleted_at)));
    expect(created).toMatchObject({ checkin: null, started_at: null });
    expect(await liveSets()).toHaveLength(4);
  });

  it('a new plan starts from the last one and replaces its card', async () => {
    const model = plannerAnswering(planOutput(), planOutput({ rationale: 'Bez wyciskania.' }));
    const first = await proposeWorkout(() => model, {
      date: LATER,
      time_min: 30,
      pain: 'bark',
    });
    const second = await proposeWorkout(() => model, {
      date: LATER,
      change_request: 'bez wyciskania',
    });

    const sent = promptOf(model, 1);
    expect(sent).toContain('time available: 30 min');
    expect(sent).toContain('pain or limitations: bark');
    expect(sent).toContain('Krótki trening');
    expect(sent).toContain('The athlete asks for this change: bez wyciskania');

    expect(await storedOutput(first.messageId)).toMatchObject({ status: 'rejected', changes: [] });
    expect((await confirm(first.output.proposalId)).status).toBe(409);
    expect((await confirm(second.output.proposalId)).status).toBe(200);
    expect((await db().select().from(workouts))[0]?.rationale).toBe('Bez wyciskania.');
  });

  it('a new check-in takes nothing from the last plan of the day', async () => {
    const model = plannerAnswering(planOutput(), planOutput());
    await proposeWorkout(() => model, { date: LATER, wellbeing: 2, pain: 'bark' });
    const { output } = await proposeWorkout(() => model, { date: LATER, time_min: 45 });

    const sent = promptOf(model, 1);
    expect(sent).toContain('time available: 45 min');
    expect(sent).toContain('wellbeing (1-5): not given');
    expect(sent).toContain('pain or limitations: none reported');
    expect(sent).not.toContain('The last proposed plan');

    expect((await confirm(output.proposalId)).status).toBe(200);
    expect((await db().select().from(workouts))[0]?.checkin).toEqual({
      time_min: 45,
      wellbeing: null,
      pain: null,
    });
  });

  it('a plan in a later thread starts from the waiting one and replaces its card', async () => {
    const model = plannerAnswering(planOutput(), planOutput({ rationale: 'Lżej.' }));
    const first = await proposeWorkout(() => model, { date: LATER, pain: 'bark' });
    await startThread();
    const second = await proposeWorkout(() => model, { date: LATER, change_request: 'lżej' });

    const sent = promptOf(model, 1);
    expect(sent).toContain('pain or limitations: bark');
    expect(sent).toContain('Krótki trening');

    expect(await storedOutput(first.messageId)).toMatchObject({ status: 'rejected', changes: [] });
    expect((await confirm(first.output.proposalId)).status).toBe(409);
    expect((await confirm(second.output.proposalId)).status).toBe(200);
    expect((await db().select().from(workouts))[0]?.rationale).toBe('Lżej.');
  });

  it('a later thread does not start from a plan already resolved in another', async () => {
    const model = plannerAnswering(planOutput(), planOutput());
    const first = await proposeWorkout(() => model, { date: LATER, pain: 'bark' });
    expect((await confirm(first.output.proposalId)).status).toBe(200);
    await startThread();
    await proposeWorkout(() => model, { date: LATER, change_request: 'lżej' });

    expect(promptOf(model, 1)).toContain('pain or limitations: none reported');
  });

  it('hints cover every available exercise with history, not only recent ones', async () => {
    const workout = workoutRow({ date: addDays(TODAY, -40) });
    const done = setRow(workout.id, {
      status: 'done',
      performed_at: `${workout.date}T17:00:00+01:00`,
      weight_kg: 24,
    });
    expect((await push(token, [upsert('workouts', workout), upsert('sets', done)])).status).toBe(
      200,
    );
    const hint = `${repsExercise.name_pl}: 24 kg x 10 (reentry`;

    const model = plannerAnswering(planOutput(), planOutput());
    await proposeWorkout(() => model);
    expect(promptOf(model)).toContain(hint);

    expect(
      (await push(token, [upsert('exercises', { ...repsExercise, archived: true })])).status,
    ).toBe(200);
    await proposeWorkout(() => model);
    expect(promptOf(model, 1)).not.toContain(hint);
  });

  it('a plan for another day takes nothing from the last one and leaves its card', async () => {
    const model = plannerAnswering(planOutput(), planOutput());
    const later = await proposeWorkout(() => model, { date: LATER, time_min: 30 });
    const today = await proposeWorkout(() => model, { date: TODAY });
    expect(promptOf(model, 1)).toContain('time available: not given');

    expect(await storedOutput(later.messageId)).toMatchObject({ status: 'pending' });
    expect((await confirm(later.output.proposalId)).status).toBe(200);
    expect((await confirm(today.output.proposalId)).status).toBe(200);
  });

  it('confirming fails as stale when an exercise was archived since', async () => {
    const model = plannerAnswering(planOutput());
    const { output } = await proposeWorkout(() => model, { date: LATER });
    expect(
      (await push(token, [upsert('exercises', { ...repsExercise, archived: true })])).status,
    ).toBe(200);

    const response = await confirm(output.proposalId);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: 'stale',
      reason: 'plan_exercise_unavailable',
    });
    expect(await liveSets()).toHaveLength(0);
  });

  it('confirming fails as stale once the day of the plan has passed', async () => {
    const model = plannerAnswering(planOutput());
    const { output } = await proposeWorkout(() => model, { date: YESTERDAY }, YESTERDAY);

    const response = await confirm(output.proposalId);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ error: 'stale', reason: 'past_date' });
    expect(await liveSets()).toHaveLength(0);
  });

  it('reasons a plan cannot be made go back to the model, with nothing stored', async () => {
    const proposals = () => db().select().from(pendingProposals);
    const errorOf = async (planner: () => MockLanguageModelV4, input = {}) =>
      (await proposeWorkout(planner, input)).output;

    expect(await errorOf(() => plannerAnswering(planOutput()), { date: YESTERDAY })).toEqual({
      error: 'past_date',
      date: YESTERDAY,
      today: TODAY,
    });

    const unknown = planOutput({
      exercises: [
        {
          exercise_id: 'nope',
          sets: [{ weight_kg: 10, reps: 10, duration_s: null, warmup: false }],
          target_rir: 1,
        },
      ],
    });
    expect(await errorOf(() => plannerAnswering(unknown))).toEqual({
      error: 'plan_exercise_unavailable',
      exercise_id: 'nope',
    });

    const unavailable = () => {
      throw new ProviderUnavailable('openai');
    };
    expect(await errorOf(unavailable)).toEqual({
      error: 'provider_unavailable',
      provider: 'openai',
    });

    const failing = vi.spyOn(console, 'error').mockImplementation(() => {});
    const broken = new MockLanguageModelV4({
      doGenerate: async () => {
        throw new Error('model down');
      },
    });
    expect(await errorOf(() => broken)).toEqual({ error: 'planner_failed' });
    expect(failing).toHaveBeenCalled();
    failing.mockRestore();

    expect(await proposals()).toEqual([]);
  });
});

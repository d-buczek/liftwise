import { addDays, newId, type PlanToolOutput } from '@liftwise/core';
import { MockLanguageModelV4 } from 'ai/test';
import { eq, isNull } from 'drizzle-orm';
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test';
import {
  createDevice,
  db,
  push,
  repsExercise,
  setRow,
  upsert,
  workoutRow,
} from '../../test/helpers';
import { confirmProposal, runNamed, THREAD_ID, toolContext } from '../../test/tools';
import { pendingProposals, sets, threads, workouts } from '../db/schema';
import { applyWrites } from '../sync/write';

// What plan.test.ts leaves out of the workout proposal. Confirming runs on the real clock.
const TODAY = new Date().toISOString().slice(0, 10);
const LATER = addDays(TODAY, 2);

const usage = {
  inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
  outputTokens: { total: 5, text: 5, reasoning: 0 },
};

const answering = (...texts: string[]) =>
  new MockLanguageModelV4({
    doGenerate: texts.map((text) => ({
      content: [{ type: 'text' as const, text }],
      finishReason: { unified: 'stop' as const, raw: 'stop' },
      usage,
      warnings: [],
    })),
  });

const planText = (exercise_id: string, weight_kg: number) =>
  JSON.stringify({
    exercises: [
      {
        exercise_id,
        sets: [{ weight_kg, reps: 10, duration_s: null, warmup: false }],
        target_rir: 1,
      },
    ],
    rationale: 'Plan na dziś.',
  });

const dumbbells = (max_kg: number, id = newId()) =>
  upsert('equipment_items', { id, type: 'dumbbells', props: { max_kg } });

const proposeWorkout = <T = PlanToolOutput>(input: unknown, model?: MockLanguageModelV4) =>
  runNamed<T>(
    'propose_workout',
    input,
    toolContext({ today: TODAY, planner: model && (() => model) }),
  );

const bench = () =>
  upsert('equipment_items', {
    id: newId(),
    type: 'bench',
    props: { incline: true, decline: false },
  });

const proposals = () => db().select().from(pendingProposals);
const liveSets = () => db().select().from(sets).where(isNull(sets.deleted_at));

let token: string;
beforeEach(async () => {
  ({ token } = await createDevice());
});

describe('propose_workout', () => {
  it('needs a planner: a confirmation or an MCP call has none', async () => {
    expect(await proposeWorkout({})).toEqual({ error: 'planner_unavailable' });
    expect(await proposals()).toEqual([]);
  });

  it('fails with a reason on an answer that is not a plan, and stores nothing', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(await proposeWorkout({}, answering('to nie JSON'))).toEqual({ error: 'planner_failed' });
    consoleError.mockRestore();
    expect(await proposals()).toEqual([]);
  });

  it('rejects an exercise that needs equipment the athlete lacks', async () => {
    expect(await proposeWorkout({}, answering(planText(repsExercise.id, 20)))).toEqual({
      error: 'plan_exercise_unavailable',
      exercise_id: repsExercise.id,
    });
    expect(await proposals()).toEqual([]);
  });

  it('asks for a change even without a plan to start from', async () => {
    await push(token, [dumbbells(40), bench()]);
    const model = answering(planText(repsExercise.id, 20));
    const output = await proposeWorkout({ date: LATER, change_request: 'lżej' }, model);

    expect(output).toMatchObject({ status: 'pending', date: LATER });
    const sent = JSON.stringify(model.doGenerateCalls[0]?.prompt);
    expect(sent).toContain('The athlete asks for this change: lżej');
    expect(sent).not.toContain('The last proposed plan');
    // No answer was given: the workout won't show a check-in.
    expect((await proposals())[0]?.input).toMatchObject({ checkin: null });
  });
});

describe('accepting a plan', () => {
  it('fits the weights to the dumbbells of the moment it is accepted', async () => {
    const id = newId();
    await push(token, [dumbbells(40, id), bench()]);
    const { proposalId, plan } = await proposeWorkout(
      { date: LATER },
      answering(planText(repsExercise.id, 30)),
    );
    expect(plan.exercises[0]?.sets[0]?.weight_kg).toBe(30);

    await push(token, [dumbbells(20, id)]);

    expect((await confirmProposal(token, proposalId)).status).toBe(200);
    expect((await liveSets()).map((set) => set.weight_kg)).toEqual([20]);
  });

  it('replaces the planned sets of the moment, done ones made since included', async () => {
    await push(token, [dumbbells(40), bench()]);
    const { proposalId, replaces } = await proposeWorkout(
      { date: LATER },
      answering(planText(repsExercise.id, 20)),
    );
    expect(replaces).toBe(0);

    const workout = workoutRow({ date: LATER });
    const planned = setRow(workout.id, { position: 3 });
    const logged = setRow(workout.id, {
      position: 7,
      status: 'done',
      performed_at: `${LATER}T17:00:00+01:00`,
    });
    await push(token, [
      upsert('workouts', workout),
      upsert('sets', planned),
      upsert('sets', logged),
    ]);

    expect((await confirmProposal(token, proposalId)).status).toBe(200);

    const live = await liveSets();
    expect(live.map((set) => set.id)).toContain(logged.id);
    expect(live.map((set) => set.id)).not.toContain(planned.id);
    expect(live.find((set) => set.id !== logged.id)).toMatchObject({
      workout_id: workout.id,
      position: 8,
      source: 'proposal',
    });
  });

  it('links the thread to the workout, unless it already has one (§5.9.5)', async () => {
    await applyWrites(db(), { actor: 'user', threadId: THREAD_ID }, [
      {
        groupId: newId(),
        entity: 'threads',
        op: 'upsert',
        row: { id: THREAD_ID, date: TODAY, workout_id: null },
      },
    ]);
    await push(token, [dumbbells(40), bench()]);
    const model = answering(planText(repsExercise.id, 20), planText(repsExercise.id, 22.5));
    const threadWorkout = async () =>
      (await db().select().from(threads).where(eq(threads.id, THREAD_ID)))[0]?.workout_id;
    const workoutOn = async (date: string) =>
      (await db().select().from(workouts).where(eq(workouts.date, date)))[0]?.id;

    const later = await proposeWorkout({ date: LATER }, model);
    const today = await proposeWorkout({ date: TODAY }, model);

    await confirmProposal(token, later.proposalId);
    const linked = await workoutOn(LATER);
    expect(await threadWorkout()).toBe(linked);

    await confirmProposal(token, today.proposalId);
    expect(await workoutOn(TODAY)).toEqual(expect.any(String));
    expect(await threadWorkout()).toBe(linked);
  });
});

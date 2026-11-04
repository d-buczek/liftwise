import {
  applyPlan,
  checkPlan,
  isDoneSet,
  planProposalSchema,
  workoutRequestSchema,
  type PlanProposal,
  type PlanToolOutput,
  type PlannerOutput,
} from '@liftwise/core';
import { and, desc, eq, ne, or } from 'drizzle-orm';
import { generatePlan, loadPlanContext, type PlanContext, type PlanRequest } from '../agent/plan';
import { ProviderUnavailable } from '../agent/providers';
import { pendingProposals, threads } from '../db/schema';
import { dateOf } from './common';
import { catalog, days, equipment } from './data';
import {
  defineTool,
  propose,
  recordResolution,
  ToolError,
  type PlannedWrite,
  type ToolContext,
} from './registry';

// The optional workout proposal (§5.9.6). `propose_workout` is what the `fast` model calls, or the
// chat route for a check-in or a regeneration (D53): the `planner` model works out the plan, which
// is stored as a proposal of `propose_plan`. Confirming runs that one on the current data, without
// a model.

async function checked(ctx: ToolContext, output: PlannerOutput, context?: PlanContext) {
  const result = checkPlan({
    output,
    exercises: context?.exercises ?? (await catalog(ctx.db)),
    equipment: context?.equipment ?? (await equipment(ctx.db)),
  });
  if (result.error) {
    const { code, ...details } = result.error;
    throw new ToolError(code, details);
  }
  return result.plan;
}

function assertNotPast(ctx: ToolContext, date: string) {
  if (date < ctx.today) throw new ToolError('past_date', { date, today: ctx.today });
}

const proposePlan = defineTool({
  name: 'propose_plan',
  description: "Replace a day's planned sets with an accepted plan.",
  input: planProposalSchema,
  risk: 'risky',
  internal: true,
  plan: async (ctx, { date, checkin, plan }) => {
    // The card of an earlier thread can outlive its day.
    assertNotPast(ctx, date);
    const [day, [thread], current] = await Promise.all([
      days(ctx.db, date, date),
      ctx.db.select().from(threads).where(eq(threads.id, ctx.threadId)),
      // An exercise can have been archived since the plan was made.
      checked(ctx, plan),
    ]);
    const { workout, removed, added } = applyPlan({
      date,
      workouts: day.workouts,
      sets: day.sets,
      plan: current,
      checkin,
    });
    const writes: PlannedWrite[] = [
      { entity: 'workouts', op: 'upsert', row: workout },
      ...removed.map(({ id }): PlannedWrite => ({ entity: 'sets', op: 'delete', row: { id } })),
      ...added.map((row): PlannedWrite => ({ entity: 'sets', op: 'upsert', row })),
    ];
    // The conversation belongs to this workout (§5.9.5), unless it already has one.
    if (thread && !thread.workout_id) {
      writes.push({
        entity: 'threads',
        op: 'upsert',
        row: { id: thread.id, date: thread.date, workout_id: workout.id },
      });
    }
    return writes;
  },
});

// The day's latest plan, from this thread or still waiting in another (threads are per day, a plan
// for a later day can sit in an earlier one): what a change starts from, and the check-in it keeps.
async function latestPlan(ctx: ToolContext, date: string): Promise<PlanProposal | null> {
  const rows = await ctx.db
    .select({ input: pendingProposals.input })
    .from(pendingProposals)
    .where(
      and(
        eq(pendingProposals.tool, 'propose_plan'),
        or(eq(pendingProposals.thread_id, ctx.threadId), eq(pendingProposals.status, 'pending')),
      ),
    )
    .orderBy(desc(pendingProposals.id));
  for (const { input } of rows) {
    const plan = planProposalSchema.parse(input);
    if (plan.date === date) return plan;
  }
  return null;
}

async function askPlanner(ctx: ToolContext, context: PlanContext, request: PlanRequest) {
  if (!ctx.planner) throw new ToolError('planner_unavailable');
  try {
    return await generatePlan(ctx.planner(), context, request);
  } catch (error) {
    if (error instanceof ProviderUnavailable) {
      throw new ToolError('provider_unavailable', { provider: error.provider });
    }
    console.error(error);
    throw new ToolError('planner_failed');
  }
}

// Only a day's latest plan can be accepted: its earlier ones are rejected, in any thread, and their
// cards show it. A plan for another day stays, the athlete can be planning several.
async function supersedeEarlierPlans(ctx: ToolContext, date: string, latestId: string) {
  const pending = await ctx.db
    .select({
      id: pendingProposals.id,
      threadId: pendingProposals.thread_id,
      input: pendingProposals.input,
    })
    .from(pendingProposals)
    .where(
      and(
        eq(pendingProposals.tool, 'propose_plan'),
        eq(pendingProposals.status, 'pending'),
        ne(pendingProposals.id, latestId),
      ),
    );
  for (const { id, threadId, input } of pending) {
    if (planProposalSchema.parse(input).date !== date) continue;
    await ctx.db
      .update(pendingProposals)
      .set({ status: 'rejected', resolved_at: new Date().toISOString() })
      .where(eq(pendingProposals.id, id));
    await recordResolution(ctx.db, threadId, id, { status: 'rejected', changes: [] });
  }
}

const proposeWorkout = defineTool({
  name: 'propose_workout',
  description:
    'Propose a workout for today or a later day, from a check-in: a stronger model plans it and ' +
    'the user gets a plan card to accept. Nothing changes until they accept. Also for changing ' +
    'the last plan or asking for another one (change_request). Pass only what the user said.',
  input: workoutRequestSchema.partial({ date: true }),
  risk: 'risky',
  propose: async (ctx, input) => {
    const date = dateOf(ctx, input.date);
    assertNotPast(ctx, date);

    const [context, latest] = await Promise.all([
      loadPlanContext(ctx.db, date, ctx.today),
      latestPlan(ctx, date),
    ]);
    // A change keeps the check-in of the plan it changes; a new check-in stands on its own.
    const kept = input.change_request ? latest?.checkin : null;
    const checkin = {
      time_min: input.time_min ?? kept?.time_min ?? null,
      wellbeing: input.wellbeing ?? kept?.wellbeing ?? null,
      pain: input.pain ?? kept?.pain ?? null,
    };
    const output = await askPlanner(ctx, context, {
      checkin,
      change: input.change_request
        ? { request: input.change_request, plan: latest?.plan ?? null }
        : undefined,
    });
    const plan = await checked(ctx, output, context);

    const given = Object.values(checkin).some((answer) => answer !== null);
    const stored: PlanProposal = { date, checkin: given ? checkin : null, plan };
    const { proposalId, status } = await propose(ctx, proposePlan, stored);
    await supersedeEarlierPlans(ctx, date, proposalId);
    const replaces = context.day.filter((set) => !isDoneSet(set)).length;
    return { proposalId, status, changes: [], date, plan, replaces } satisfies PlanToolOutput;
  },
});

export const planTools = [proposeWorkout, proposePlan];

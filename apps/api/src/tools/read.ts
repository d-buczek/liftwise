import {
  balanceSnapshot,
  bestE1rm,
  daysBetween,
  exerciseSessions,
  foldText,
  matchesQuery,
  maxDumbbellKg,
  progressionHint,
  recordTable,
  swapSuggestions,
  weeklySummary,
} from '@liftwise/core';
import { z } from 'zod';
import {
  balanceSets,
  balanceSettings,
  catalog,
  days,
  equipment,
  history,
  labels,
  profile,
  trainingSettings,
} from './data';
import { dateInput, dateOf, exerciseIdInput, exerciseOf, setView, workoutsView } from './common';
import { defineTool, ToolError } from './registry';

// Read tools (§6.6) run immediately.

const MAX_RANGE_DAYS = 62;

export const readTools = [
  defineTool({
    name: 'find_exercise',
    description:
      'Find catalog exercises by name or alias (diacritics and case ignored). Use it when the ' +
      'catalog in the context gives no single clear match.',
    input: z.object({ query: z.string().describe('The exercise as the user said it') }),
    risk: 'read',
    run: async (ctx, { query }) => {
      const exercises = await catalog(ctx.db);
      let found = exercises.filter((exercise) => matchesQuery(exercise, query));
      // No exercise has every word: the ones with any word are candidates to ask about.
      if (found.length === 0) {
        const words = foldText(query).split(/\s+/).filter(Boolean);
        found = exercises.filter((exercise) => words.some((word) => matchesQuery(exercise, word)));
      }
      return {
        exercises: found.slice(0, 10).map((exercise) => ({
          id: exercise.id,
          name: exercise.name_pl,
          aliases: exercise.aliases,
          measure: exercise.measure,
          archived: exercise.archived,
        })),
      };
    },
  }),
  defineTool({
    name: 'get_exercise_history',
    description:
      'Done working sets of one exercise per session, newest session first (warm-ups and ' +
      'planned sets left out).',
    input: z.object({
      exercise_id: exerciseIdInput,
      sessions: z.number().int().min(1).max(20).optional().describe('How many sessions, default 5'),
    }),
    risk: 'read',
    run: async (ctx, { exercise_id, sessions = 5 }) => {
      const exercise = exerciseOf(await catalog(ctx.db), exercise_id);
      const found = exerciseSessions(await history(ctx.db, [exercise_id]), exercise);
      return {
        exercise: exercise.name_pl,
        measure: exercise.measure,
        sessions: found
          .slice(-sessions)
          .reverse()
          .map((session) => ({
            date: session.date,
            workout_id: session.workout_id,
            sets: session.sets.map((set) => setView(set, [exercise])),
          })),
      };
    },
  }),
  defineTool({
    name: 'get_workouts',
    description: `Workouts with all their sets (planned and done) in a date range of at most ${MAX_RANGE_DAYS} days.`,
    input: z.object({ from: dateInput, to: dateInput }),
    risk: 'read',
    run: async (ctx, input) => {
      const [from, to] = [dateOf(ctx, input.from), dateOf(ctx, input.to)];
      const span = daysBetween(from, to);
      if (span < 0 || span >= MAX_RANGE_DAYS) throw new ToolError('invalid_range', { from, to });
      const [data, exercises, allLabels] = await Promise.all([
        days(ctx.db, from, to),
        catalog(ctx.db),
        labels(ctx.db),
      ]);
      return { workouts: workoutsView(data, exercises, allLabels) };
    },
  }),
  defineTool({
    name: 'get_active_workout',
    description:
      "Today's workouts with their planned and done sets; the last done set has the latest " +
      'performed_at.',
    input: z.object({}),
    risk: 'read',
    run: async (ctx) => {
      const [data, exercises, allLabels] = await Promise.all([
        days(ctx.db, ctx.today, ctx.today),
        catalog(ctx.db),
        labels(ctx.db),
      ]);
      return { date: ctx.today, workouts: workoutsView(data, exercises, allLabels) };
    },
  }),
  defineTool({
    name: 'get_records',
    description:
      'Records of an exercise: the best reps (or seconds) per weight and the best estimated 1RM.',
    input: z.object({ exercise_id: exerciseIdInput }),
    risk: 'read',
    run: async (ctx, { exercise_id }) => {
      const exercise = exerciseOf(await catalog(ctx.db), exercise_id);
      const sets = await history(ctx.db, [exercise_id]);
      return {
        exercise: exercise.name_pl,
        measure: exercise.measure,
        per_weight: recordTable(sets, exercise),
        best_e1rm: bestE1rm(sets, exercise),
      };
    },
  }),
  defineTool({
    name: 'get_balance',
    description:
      'Hard sets per muscle group in the last 7 days against the target ranges, and days since ' +
      'each muscle group and movement pattern was last trained.',
    input: z.object({}),
    risk: 'read',
    run: async (ctx) => {
      const [sets, exercises, balance] = await Promise.all([
        balanceSets(ctx.db, ctx.today),
        catalog(ctx.db),
        balanceSettings(ctx.db),
      ]);
      return balanceSnapshot({ sets, exercises, balance, today: ctx.today });
    },
  }),
  defineTool({
    name: 'get_progression_hints',
    description:
      'Progression hints (next weight, reps, sets) for one exercise, or for every exercise ' +
      'planned or done on a day.',
    input: z.object({
      date: dateInput.optional().describe('Local date, YYYY-MM-DD; default today'),
      exercise_id: exerciseIdInput.optional(),
    }),
    risk: 'read',
    run: async (ctx, input) => {
      const date = dateOf(ctx, input.date);
      const [exercises, training, items, data] = await Promise.all([
        catalog(ctx.db),
        trainingSettings(ctx.db),
        equipment(ctx.db),
        days(ctx.db, date, date),
      ]);
      const ids = input.exercise_id
        ? [exerciseOf(exercises, input.exercise_id).id]
        : [...new Set(data.sets.map((set) => set.exercise_id))];
      const sets = await history(ctx.db, ids);
      const maxWeightKg = maxDumbbellKg(items);
      return {
        date,
        hints: ids.map((id) => {
          const exercise = exerciseOf(exercises, id);
          const hint = progressionHint({ exercise, training, sets, date, maxWeightKg });
          return { exercise_id: id, exercise: exercise.name_pl, hint };
        }),
      };
    },
  }),
  defineTool({
    name: 'get_swap_options',
    description:
      'Similar available exercises to swap one for (same measure, shared primary muscles).',
    input: z.object({ exercise_id: exerciseIdInput }),
    risk: 'read',
    run: async (ctx, { exercise_id }) => {
      const [exercises, items, sets] = await Promise.all([
        catalog(ctx.db),
        equipment(ctx.db),
        history(ctx.db),
      ]);
      const exercise = exerciseOf(exercises, exercise_id);
      const options = swapSuggestions({ exercise, catalog: exercises, equipment: items, sets });
      return { options: options.slice(0, 8).map(({ id, name_pl }) => ({ id, name: name_pl })) };
    },
  }),
  defineTool({
    name: 'get_weekly_summary',
    description:
      'The Monday–Sunday summary of a week: workouts, working sets, hard sets per muscle group, ' +
      'records, stalled exercises, neglected muscles and patterns.',
    input: z.object({
      date: dateInput.optional().describe('Any day of the week, YYYY-MM-DD; default today'),
    }),
    risk: 'read',
    run: async (ctx, input) => {
      const [sets, exercises, training, balance] = await Promise.all([
        history(ctx.db),
        catalog(ctx.db),
        trainingSettings(ctx.db),
        balanceSettings(ctx.db),
      ]);
      const date = dateOf(ctx, input.date);
      const summary = weeklySummary({ date, sets, exercises, training, balance });
      const name = (id: string) => exercises.find((exercise) => exercise.id === id)?.name_pl;
      return {
        ...summary,
        records: summary.records.map((record) => ({
          ...record,
          exercise: name(record.exercise_id),
        })),
        stalled: summary.stalled.map((id) => ({ exercise_id: id, exercise: name(id) })),
      };
    },
  }),
  defineTool({
    name: 'get_profile',
    description: 'The athlete profile document (goals, limitations, preferences).',
    input: z.object({}),
    risk: 'read',
    run: async (ctx) => ({ content: await profile(ctx.db) }),
  }),
  defineTool({
    name: 'get_equipment',
    description: 'The equipment profile (dumbbells with their heaviest weight, bench).',
    input: z.object({}),
    risk: 'read',
    run: async (ctx) => ({ items: await equipment(ctx.db) }),
  }),
];

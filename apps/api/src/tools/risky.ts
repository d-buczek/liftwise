import {
  ATHLETE_PROFILE_ID,
  equipmentTypeSchema,
  measureSchema,
  movementPatternSchema,
  muscleGroupSchema,
  newId,
  roundWeightKg,
  SETTING_IDS,
  WEIGHT_PRECISION_KG,
  type Exercise,
} from '@liftwise/core';
import { z } from 'zod';
import { exerciseIdInput, exerciseOf } from './common';
import { balanceSettings, catalog, setsById, trainingSettings } from './data';
import { defineTool, ToolError, type PlannedWrite, type ToolContext } from './registry';
import { editedSet } from './write';

// Risky tools (§5.9.3) return a proposal; the change runs only when the user confirms it.

async function existingSets(ctx: ToolContext, ids: string[]) {
  const found = await setsById(ctx.db, ids);
  const missing = ids.filter((id) => !found.some((set) => set.id === id));
  if (missing.length > 0) throw new ToolError('set_not_found', { set_ids: missing });
  return found;
}

const exerciseFields = {
  name_pl: z.string().min(1).describe('Polish name'),
  aliases: z.array(z.string()).optional().describe('Other names, also English'),
  primary_muscles: z.array(muscleGroupSchema).min(1),
  secondary_muscles: z.array(muscleGroupSchema).optional(),
  patterns: z.array(movementPatternSchema).min(1),
  requires: z.array(equipmentTypeSchema).optional(),
  implements: z.number().int().min(1).max(2).describe('Dumbbells used at once'),
  unilateral: z.boolean(),
  range_min: z.number().int().positive().describe('Target range: reps, or seconds when timed'),
  range_max: z.number().int().positive(),
  rest_seconds: z.number().int().nonnegative().optional(),
  weight_step_kg: z.number().positive().optional(),
  note: z.string().optional().describe('Setup note shown during the workout'),
};

// The measure's range field from the flat min / max of the tool inputs.
function withRange(
  exercise: Record<string, unknown> & { id: string },
  measure: Exercise['measure'],
  min: number,
  max: number,
): PlannedWrite['row'] {
  const range = { min, max };
  return measure === 'reps'
    ? { ...exercise, measure, rep_range: range }
    : { ...exercise, measure, time_range_s: range };
}

const upsertExercise = (row: PlannedWrite['row']): PlannedWrite => ({
  entity: 'exercises',
  op: 'upsert',
  row,
});

// The ± step on the weight precision: never rounded away to nothing, which the schema refuses.
const stepKg = <T extends number | null | undefined>(kg: T) =>
  kg ? Math.max(WEIGHT_PRECISION_KG, roundWeightKg(kg)) : kg;

export const riskyTools = [
  defineTool({
    name: 'delete_sets',
    description: 'Delete sets (done or planned). Returns a proposal the user confirms.',
    input: z.object({ set_ids: z.array(z.string()).min(1).max(50) }),
    risk: 'risky',
    plan: async (ctx, { set_ids }) =>
      (await existingSets(ctx, set_ids)).map((set) => ({
        entity: 'sets',
        op: 'delete',
        row: { id: set.id },
      })),
  }),
  defineTool({
    name: 'update_sets',
    description:
      'Change several done sets at once. Returns a proposal the user confirms; one done set is ' +
      'changed right away with update_set.',
    input: z.object({
      updates: z
        .array(
          z.object({
            set_id: z.string(),
            weight_kg: z.number().min(0).optional(),
            reps: z.number().int().positive().optional(),
            duration_s: z.number().int().positive().optional(),
            rir: z.number().int().min(0).max(4).optional(),
            warmup: z.boolean().optional(),
            note: z.string().optional(),
          }),
        )
        .min(1)
        .max(50),
    }),
    risk: 'risky',
    plan: async (ctx, { updates }) => {
      const [found, exercises] = await Promise.all([
        existingSets(
          ctx,
          updates.map((update) => update.set_id),
        ),
        catalog(ctx.db),
      ]);
      // Two updates of one set add up, like in edit_planned_sets.
      const edited = new Map<string, ReturnType<typeof editedSet>>();
      for (const { set_id, ...fields } of updates) {
        const set = edited.get(set_id) ?? found.find((row) => row.id === set_id);
        if (set?.status !== 'done') throw new ToolError('not_done', { set_id });
        edited.set(set_id, editedSet(set, exerciseOf(exercises, set.exercise_id), fields));
      }
      return [...edited.values()].map((row) => ({ entity: 'sets', op: 'upsert', row }));
    },
  }),
  defineTool({
    name: 'create_exercise',
    description:
      'Add an exercise to the catalog. Check find_exercise first. Returns a proposal the user ' +
      'confirms.',
    input: z.object({ ...exerciseFields, measure: measureSchema }),
    risk: 'risky',
    plan: async (ctx, { range_min, range_max, measure, ...fields }) => {
      // Exercises from outside the catalog start with the default rest (D46).
      const training = await trainingSettings(ctx.db);
      const row = withRange(
        {
          ...fields,
          id: newId(),
          rest_seconds: fields.rest_seconds ?? training.rest_seconds,
          weight_step_kg: stepKg(fields.weight_step_kg),
        },
        measure,
        range_min,
        range_max,
      );
      return [upsertExercise(row)];
    },
  }),
  defineTool({
    name: 'update_exercise',
    description:
      'Change a catalog exercise (name, aliases, muscles, patterns, range, rest, step, note) or ' +
      'archive it. The measure stays. Returns a proposal the user confirms.',
    input: z.object({
      exercise_id: exerciseIdInput,
      ...z.object(exerciseFields).partial().shape,
      archived: z.boolean().optional(),
    }),
    risk: 'risky',
    plan: async (ctx, { exercise_id, range_min, range_max, weight_step_kg, ...rest }) => {
      const exercise = exerciseOf(await catalog(ctx.db), exercise_id);
      const fields = { ...rest, weight_step_kg: stepKg(weight_step_kg) };
      const range = exercise.measure === 'reps' ? exercise.rep_range : exercise.time_range_s;
      const changed = Object.fromEntries(
        Object.entries(fields).filter(([, value]) => value !== undefined),
      );
      const row = withRange(
        { ...exercise, ...changed },
        exercise.measure,
        range_min ?? range.min,
        range_max ?? range.max,
      );
      return [upsertExercise(row)];
    },
  }),
  defineTool({
    name: 'update_profile',
    description:
      'Replace the athlete profile document (markdown: goals, limitations and injuries, ' +
      'preferences, typical session length). Read it first and keep what stays. Returns a ' +
      'proposal the user confirms.',
    input: z.object({ content: z.string() }),
    risk: 'risky',
    plan: async (_ctx, { content }) => [
      { entity: 'athlete_profile', op: 'upsert', row: { id: ATHLETE_PROFILE_ID, content } },
    ],
  }),
  defineTool({
    name: 'update_settings',
    description:
      'Change training settings (default rest for new exercises, target RIR range, weight ' +
      'step) or weekly hard-set targets per muscle group. Returns a proposal the user confirms.',
    input: z.object({
      training: z
        .object({
          rest_seconds: z.number().int().nonnegative().optional(),
          target_rir_min: z.number().int().min(0).max(4).optional(),
          target_rir_max: z.number().int().min(0).max(4).optional(),
          weight_step_kg: z.number().positive().optional(),
        })
        .optional(),
      weekly_sets: z
        .array(
          z.object({
            muscle_group: muscleGroupSchema,
            min: z.number().int().min(0).max(40),
            max: z.number().int().min(0).max(40),
          }),
        )
        .optional(),
    }),
    risk: 'risky',
    plan: async (ctx, input) => {
      const writes: PlannedWrite[] = [];
      if (input.training) {
        const current = await trainingSettings(ctx.db);
        const { rest_seconds, target_rir_min, target_rir_max, weight_step_kg } = input.training;
        const value = {
          rest_seconds: rest_seconds ?? current.rest_seconds,
          target_rir: {
            min: target_rir_min ?? current.target_rir.min,
            max: target_rir_max ?? current.target_rir.max,
          },
          weight_step_kg:
            weight_step_kg === undefined ? current.weight_step_kg : roundWeightKg(weight_step_kg),
        };
        writes.push({
          entity: 'settings',
          op: 'upsert',
          row: { id: SETTING_IDS.training, key: 'training', value },
        });
      }
      if (input.weekly_sets?.length) {
        const current = await balanceSettings(ctx.db);
        const weekly_sets = { ...current.weekly_sets };
        for (const { muscle_group, min, max } of input.weekly_sets) {
          weekly_sets[muscle_group] = { min, max };
        }
        writes.push({
          entity: 'settings',
          op: 'upsert',
          row: { id: SETTING_IDS.balance, key: 'balance', value: { weekly_sets } },
        });
      }
      return writes;
    },
  }),
];

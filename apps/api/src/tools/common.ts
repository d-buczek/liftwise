import {
  localDateSchema,
  roundWeightKg,
  type DatedSet,
  type Exercise,
  type WorkoutLabel,
  type WorkoutSet,
} from '@liftwise/core';
import { z } from 'zod';
import type { Days } from './data';
import { ToolError, type ToolContext } from './registry';

// Inputs and views shared by the tools. Ids and dates are plain strings in the inputs (providers
// differ in the string formats tool schemas may use) and are checked by the handlers.

export const dateInput = z.string().describe('Local date, YYYY-MM-DD');
export const exerciseIdInput = z.string().describe('Exercise id from the catalog');

export function dateOf(ctx: ToolContext, value: string | undefined): string {
  if (value === undefined) return ctx.today;
  if (!localDateSchema.safeParse(value).success) throw new ToolError('invalid_date', { value });
  return value;
}

export function exerciseOf(exercises: Exercise[], id: string): Exercise {
  const exercise = exercises.find((row) => row.id === id);
  if (!exercise) throw new ToolError('exercise_not_found', { exercise_id: id });
  return exercise;
}

// A set as the model sees it: the value of its measure only, names next to ids.
export function setView(set: DatedSet, exercises: Exercise[]) {
  return {
    id: set.id,
    exercise_id: set.exercise_id,
    exercise: exercises.find((row) => row.id === set.exercise_id)?.name_pl ?? null,
    position: set.position,
    status: set.status,
    weight_kg: set.weight_kg,
    ...(set.duration_s === null ? { reps: set.reps } : { duration_s: set.duration_s }),
    rir: set.rir,
    warmup: set.warmup,
    note: set.note,
    performed_at: set.performed_at,
  };
}

export function workoutsView(data: Days, exercises: Exercise[], allLabels: WorkoutLabel[]) {
  return data.workouts.map((workout) => ({
    id: workout.id,
    date: workout.date,
    label: allLabels.find((label) => label.id === workout.label_id)?.name ?? null,
    started_at: workout.started_at,
    ended_at: workout.ended_at,
    note: workout.note,
    sets: data.sets
      .filter((set) => set.workout_id === workout.id)
      .map((set) => setView(set, exercises)),
  }));
}

// A set's weight and value as the model gives them, checked against the exercise's measure.
export const setValuesInput = {
  weight_kg: z.number().min(0).describe('Per dumbbell, kg; 0 for bodyweight'),
  reps: z.number().int().positive().optional().describe('For exercises measured in reps'),
  duration_s: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Seconds, for exercises measured in time'),
};

export function measured(
  exercise: Exercise,
  values: { weight_kg: number; reps?: number; duration_s?: number },
): Pick<WorkoutSet, 'weight_kg' | 'reps' | 'duration_s'> {
  const weight_kg = roundWeightKg(values.weight_kg);
  if (exercise.measure === 'reps') {
    if (values.reps === undefined)
      throw new ToolError('reps_missing', { exercise: exercise.name_pl });
    return { weight_kg, reps: values.reps, duration_s: null };
  }
  if (values.duration_s === undefined) {
    throw new ToolError('duration_missing', { exercise: exercise.name_pl });
  }
  return { weight_kg, reps: null, duration_s: values.duration_s };
}

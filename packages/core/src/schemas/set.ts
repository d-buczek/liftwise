import { z } from 'zod';
import { idSchema } from '../ids';
import { rirSchema, timestampSchema, weightKgSchema } from './common';
import type { Exercise } from './exercise';

export const setStatusSchema = z.enum(['planned', 'done']);
export type SetStatus = z.infer<typeof setStatusSchema>;

export const setSourceSchema = z.enum(['manual', 'copy', 'agent', 'proposal']);
export type SetSource = z.infer<typeof setSourceSchema>;

export const workoutSetSchema = z
  .object({
    id: idSchema,
    workout_id: idSchema,
    exercise_id: idSchema,
    position: z.int().nonnegative(),
    status: setStatusSchema,
    weight_kg: weightKgSchema,
    // Exactly one of reps / duration_s, by the exercise's measure (D32).
    reps: z.int().positive().nullable().default(null),
    duration_s: z.int().positive().nullable().default(null),
    rir: rirSchema.nullable().default(null),
    warmup: z.boolean().default(false),
    note: z.string().default(''),
    performed_at: timestampSchema.nullable().default(null),
    source: setSourceSchema,
  })
  .refine((set) => (set.reps === null) !== (set.duration_s === null), {
    message: 'a set has either reps or duration_s',
    path: ['reps'],
  })
  .refine((set) => (set.status === 'done') === (set.performed_at !== null), {
    message: 'performed_at is set exactly when the set is done',
    path: ['performed_at'],
  });
export type WorkoutSet = z.infer<typeof workoutSetSchema>;

// The measured value: reps, or seconds for a timed set.
export function setValue(set: Pick<WorkoutSet, 'reps' | 'duration_s'>): number {
  return set.reps ?? set.duration_s ?? 0;
}

export function setMatchesMeasure(
  set: Pick<WorkoutSet, 'reps' | 'duration_s'>,
  exercise: Pick<Exercise, 'measure'>,
): boolean {
  return exercise.measure === 'reps'
    ? set.reps !== null && set.duration_s === null
    : set.duration_s !== null && set.reps === null;
}

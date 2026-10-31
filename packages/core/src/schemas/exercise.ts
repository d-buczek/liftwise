import { z } from 'zod';
import { idSchema } from '../ids';
import { rangeOf, weightKgSchema } from './common';
import { equipmentTypeSchema } from './equipment';

export const muscleGroupSchema = z.enum([
  'chest',
  'lats',
  'upper_back',
  'front_delts',
  'side_delts',
  'rear_delts',
  'biceps',
  'triceps',
  'forearms',
  'quads',
  'hamstrings',
  'glutes',
  'calves',
  'abs',
  'lower_back',
]);
export type MuscleGroup = z.infer<typeof muscleGroupSchema>;

export const movementPatternSchema = z.enum([
  'horizontal_push',
  'vertical_push',
  'horizontal_pull',
  'vertical_pull',
  'squat',
  'hinge',
  'lunge',
  'core',
  'isolation',
]);
export type MovementPattern = z.infer<typeof movementPatternSchema>;

export const measureSchema = z.enum(['reps', 'time']);
export type Measure = z.infer<typeof measureSchema>;

const exerciseFields = z.object({
  id: idSchema,
  name_pl: z.string().trim().min(1),
  aliases: z.array(z.string().trim().min(1)).default([]),
  primary_muscles: z.array(muscleGroupSchema).min(1),
  secondary_muscles: z.array(muscleGroupSchema).default([]),
  patterns: z.array(movementPatternSchema).min(1),
  requires: z.array(equipmentTypeSchema).default([]),
  // Dumbbells used at once; bodyweight exercises use 1. Volume = weight × reps × implements.
  implements: z.literal([1, 2]),
  // Reps (or time) are counted per side.
  unilateral: z.boolean(),
  rest_seconds: z.int().nonnegative(),
  // Overrides the default ± weight step (D31).
  weight_step_kg: weightKgSchema.positive().nullable().default(null),
  // The user's setup note, shown on the exercise card (§5.2).
  note: z.string().nullable().default(null),
  archived: z.boolean().default(false),
});

const positiveRange = rangeOf(z.int().positive());

export const exerciseSchema = z
  .discriminatedUnion('measure', [
    exerciseFields.extend({ measure: z.literal('reps'), rep_range: positiveRange }),
    exerciseFields.extend({ measure: z.literal('time'), time_range_s: positiveRange }),
  ])
  .refine((ex) => !ex.secondary_muscles.some((m) => ex.primary_muscles.includes(m)), {
    message: 'a muscle is either primary or secondary',
    path: ['secondary_muscles'],
  });
export type Exercise = z.infer<typeof exerciseSchema>;
export type ExerciseInput = z.input<typeof exerciseSchema>;

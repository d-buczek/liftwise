import { z } from 'zod';
import { idSchema } from '../ids';

// Workout labels (D48): a training set such as "A", "B" or "Push" with a color from a fixed
// palette; the UI maps each key to a light and a dark value. No amber or rust: those mean
// records and danger (§5.13). Cobalt and straw, the accents of unlabelled days, come last, so new
// labels start with the others.
export const LABEL_COLORS = [
  'teal',
  'violet',
  'green',
  'magenta',
  'graphite',
  'cobalt',
  'straw',
] as const;
export const labelColorSchema = z.enum(LABEL_COLORS);
export type LabelColor = z.infer<typeof labelColorSchema>;

// Short enough to show whole in a calendar day on a phone.
export const LABEL_NAME_MAX = 6;

export const workoutLabelSchema = z.object({
  id: idSchema,
  name: z.string().trim().min(1).max(LABEL_NAME_MAX),
  color: labelColorSchema,
  // An archived label stays on its workouts but is no longer offered.
  archived: z.boolean().default(false),
});
export type WorkoutLabel = z.infer<typeof workoutLabelSchema>;

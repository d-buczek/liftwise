import { z } from 'zod';
import { idSchema } from '../ids';
import { localDateSchema, timestampSchema } from './common';

// Pre-workout check-in for the optional proposal flow (§5.9.6).
export const checkinSchema = z.object({
  time_min: z.int().positive().nullable().default(null),
  wellbeing: z.int().min(1).max(5).nullable().default(null),
  pain: z.string().nullable().default(null),
});
export type Checkin = z.infer<typeof checkinSchema>;

export const workoutSchema = z.object({
  id: idSchema,
  // A workout belongs to one local date (§5.2).
  date: localDateSchema,
  started_at: timestampSchema.nullable().default(null),
  ended_at: timestampSchema.nullable().default(null),
  checkin: checkinSchema.nullable().default(null),
  // Rationale of an accepted AI proposal.
  rationale: z.string().nullable().default(null),
  note: z.string().default(''),
  // The training set the workout belongs to (D48).
  label_id: idSchema.nullable().default(null),
});
export type Workout = z.infer<typeof workoutSchema>;

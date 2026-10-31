import { z } from 'zod';
import { idSchema } from '../ids';

// The single row has a fixed id, so devices creating it offline write the same row (D41).
export const ATHLETE_PROFILE_ID = '01a18f41-8c00-7000-8001-000000000001';

// Single row: a markdown document with goals, limitations, preferences and session length (§5.9.5).
export const athleteProfileSchema = z.object({
  id: idSchema,
  content: z.string().default(''),
});
export type AthleteProfile = z.infer<typeof athleteProfileSchema>;

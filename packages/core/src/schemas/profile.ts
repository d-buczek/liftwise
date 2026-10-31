import { z } from 'zod';
import { idSchema } from '../ids';

// Single row: a markdown document with goals, limitations, preferences and session length (§5.9.5).
export const athleteProfileSchema = z.object({
  id: idSchema,
  content: z.string().default(''),
});
export type AthleteProfile = z.infer<typeof athleteProfileSchema>;

import { z } from 'zod';
import { idSchema } from '../ids';
import { localDateSchema } from './common';

// Agent conversations (§5.9.5): one thread per day by default; only the server writes them.
export const threadSchema = z.object({
  id: idSchema,
  date: localDateSchema,
  // The workout a check-in conversation belongs to (LW-11).
  workout_id: idSchema.nullable().default(null),
});
export type Thread = z.infer<typeof threadSchema>;

// A chat message as the AI SDK's UI message: its parts are text, tool calls and their results.
export const messageSchema = z.object({
  id: idSchema,
  thread_id: idSchema,
  role: z.enum(['user', 'assistant']),
  parts: z.array(z.looseObject({ type: z.string() })),
});
export type Message = z.infer<typeof messageSchema>;

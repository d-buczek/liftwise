import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { z } from 'zod';

// Error bodies are `{ error: '<code>' }`; clients map the code to a Polish message.
export function apiError(c: Context, status: ContentfulStatusCode, code: string) {
  return c.json({ error: code }, status);
}

// The JSON body parsed with `schema`; null when it is missing, malformed or invalid.
export async function readJson<T extends z.ZodType>(
  c: Context,
  schema: T,
): Promise<z.infer<T> | null> {
  const result = schema.safeParse(await c.req.json().catch(() => undefined));
  return result.success ? result.data : null;
}

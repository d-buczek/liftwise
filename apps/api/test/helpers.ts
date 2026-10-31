import { newId } from '@liftwise/core';
import { env } from 'cloudflare:test';
import { generateToken, sha256Hex } from '../src/auth/tokens';
import { createDb } from '../src/db';
import { devices } from '../src/db/schema';
import app from '../src/index';

export const db = () => createDb(env.DB);

// Inserts an active device, as `device:create` does, and returns its token.
export async function createDevice(name = 'PC', fields: Partial<typeof devices.$inferInsert> = {}) {
  const token = generateToken();
  const id = newId();
  await db()
    .insert(devices)
    .values({
      id,
      name,
      token_hash: await sha256Hex(token),
      created_at: new Date().toISOString(),
      ...fields,
    });
  return { id, token };
}

export function call(path: string, init: RequestInit & { token?: string; json?: unknown } = {}) {
  const { token, json, ...rest } = init;
  const headers = new Headers(rest.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (json !== undefined) headers.set('Content-Type', 'application/json');
  const body = json === undefined ? rest.body : JSON.stringify(json);
  return app.request(path, { ...rest, headers, body }, env);
}
